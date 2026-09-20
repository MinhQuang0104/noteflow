import type { QueryClient } from '@tanstack/vue-query'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import * as accountApi from '../api/account'
import type { AccountContext } from '../api/account'
import { queryClient as defaultQueryClient } from '../queryClient'
import { useAccountStore } from './account'
import { useAuthStore, type AuthStatus } from './auth'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'paused' | 'error'

const BASE_POLL_INTERVAL_MS = 5000
const MAX_BACKOFF_DELAY_MS = 30000

export const useSyncStore = defineStore('sync', () => {
  const auth = useAuthStore()
  const account = useAccountStore()

  // Injected queryClient for testability and runtime
  let currentQueryClient: QueryClient = defaultQueryClient

  // Reactive state
  const syncStatus = ref<SyncStatus>('idle')
  const syncError = ref<string | null>(null)
  const isOnline = ref<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const isVisible = ref<boolean>(typeof document !== 'undefined' ? document.visibilityState === 'visible' : true)
  const lastSyncedAt = ref<Date | null>(null)
  const lastRevision = ref<number | null>(null)
  const lastEpoch = ref<number | null>(null)
  const lastWriteState = ref<string | null>(null)
  const inFlight = ref<boolean>(false)
  const consecutiveFailures = ref<number>(0)

  // Internal concurrency & generation tracking
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let isStarted = false
  const requestGeneration = ref<number>(0)
  const latestCompletedRequestGeneration = ref<number>(0)

  function setQueryClient(qc: QueryClient): void {
    currentQueryClient = qc
  }

  function getBackoffDelay(): number {
    if (consecutiveFailures.value === 0) return BASE_POLL_INTERVAL_MS
    const backoff = BASE_POLL_INTERVAL_MS * Math.min(Math.pow(2, consecutiveFailures.value), 6)
    return Math.min(backoff, MAX_BACKOFF_DELAY_MS)
  }

  function clearTimer(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function scheduleNextPoll(delayMs?: number): void {
    clearTimer()
    if (!isStarted || auth.status !== 'authenticated') return
    if (!isVisible.value || !isOnline.value) {
      syncStatus.value = 'paused'
      return
    }

    const delay = delayMs ?? (consecutiveFailures.value > 0 ? getBackoffDelay() : BASE_POLL_INTERVAL_MS)
    pollTimer = setTimeout(() => {
      void poll()
    }, delay)
  }

  async function reconcileInternal(): Promise<boolean> {
    if (inFlight.value) return false
    if (auth.status !== 'authenticated') {
      syncStatus.value = 'idle'
      return false
    }

    inFlight.value = true
    syncStatus.value = 'syncing'

    const capturedAuthGen = auth.generation
    const currentReqGen = ++requestGeneration.value

    try {
      const nextContext: AccountContext = await accountApi.getAccountContext()

      // Fencing check 1: Auth generation rotated while request was in flight
      if (auth.generation !== capturedAuthGen) {
        return false
      }

      // Fencing check 2: Newer request already finished (out of order response)
      if (currentReqGen < latestCompletedRequestGeneration.value) {
        return false
      }
      latestCompletedRequestGeneration.value = currentReqGen

      // Cache invalidation & epoch change handling
      const prevRevision = lastRevision.value
      const prevEpoch = lastEpoch.value

      // Monotonic revision check: if same epoch, do not regress revision
      if (prevEpoch === null || nextContext.data_epoch === prevEpoch) {
        if (prevRevision !== null && nextContext.account_revision > prevRevision) {
          // Higher revision detected: invalidate owner query caches
          await currentQueryClient.invalidateQueries({ queryKey: ['challenges'] })
        }
        lastRevision.value = prevRevision !== null ? Math.max(prevRevision, nextContext.account_revision) : nextContext.account_revision
      } else {
        // Epoch changed (e.g., restore or epoch bump)
        // Clear server state cache and stop old retries
        currentQueryClient.clear()
        await currentQueryClient.invalidateQueries({ queryKey: ['challenges'] })
        lastRevision.value = nextContext.account_revision
      }

      lastEpoch.value = nextContext.data_epoch
      lastWriteState.value = nextContext.write_state
      lastSyncedAt.value = new Date()

      // Update account store context without clearing valid state on future failure
      account.context = nextContext
      account.status = 'ready'

      consecutiveFailures.value = 0
      syncError.value = null
      syncStatus.value = 'synced'

      return true
    } catch (error: unknown) {
      // Fencing check: auth changed during flight
      if (auth.generation !== capturedAuthGen) {
        return false
      }

      const responseStatus =
        typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status: number }).status
          : null

      if (responseStatus === 401 || responseStatus === 403) {
        stop()
        await auth.refreshSession()
        return false
      }

      consecutiveFailures.value++
      syncError.value = 'Không thể đồng bộ dữ liệu. Đang thử lại...'
      syncStatus.value = 'error'

      // Important (AC4): DO NOT wipe existing valid account context!
      if (!account.context) {
        account.status = 'error'
      }

      return false
    } finally {
      inFlight.value = false
    }
  }

  async function poll(): Promise<void> {
    if (!isStarted || auth.status !== 'authenticated') return
    if (!isVisible.value || !isOnline.value) {
      syncStatus.value = 'paused'
      return
    }

    const capturedAuthGen = auth.generation
    const success = await reconcileInternal()

    if (auth.generation !== capturedAuthGen) return

    if (isStarted && auth.status === 'authenticated' && isVisible.value && isOnline.value) {
      scheduleNextPoll(success ? BASE_POLL_INTERVAL_MS : getBackoffDelay())
    }
  }

  async function reconcile(force = false): Promise<boolean> {
    clearTimer()
    if (force) {
      consecutiveFailures.value = 0
      syncError.value = null
    }

    const capturedAuthGen = auth.generation
    const success = await reconcileInternal()

    if (auth.generation !== capturedAuthGen) return false

    if (isStarted && auth.status === 'authenticated' && isVisible.value && isOnline.value) {
      scheduleNextPoll(success ? BASE_POLL_INTERVAL_MS : getBackoffDelay())
    }

    return success
  }

  function recordMutationAck(revision: number, epoch: number): void {
    if (lastEpoch.value === null || epoch === lastEpoch.value) {
      lastRevision.value = lastRevision.value !== null ? Math.max(lastRevision.value, revision) : revision
    } else {
      lastRevision.value = revision
    }
    lastEpoch.value = epoch
    consecutiveFailures.value = 0
    syncError.value = null
    syncStatus.value = 'synced'

    void currentQueryClient.invalidateQueries({ queryKey: ['challenges'] })
  }

  async function reconcileBeforeWrite(): Promise<{ allowed: boolean; reason?: string }> {
    // If not currently fresh, run reconcile
    await reconcile()

    if (account.status !== 'ready' || !account.context) {
      return {
        allowed: false,
        reason: 'Chưa thể ghi nhận dữ liệu: Ngữ cảnh tài khoản chưa sẵn sàng. Vui lòng thử lại sau.',
      }
    }

    if (account.context.write_state !== 'open') {
      return {
        allowed: false,
        reason: `Tài khoản đang tạm khóa ghi (${account.context.write_state}). Vui lòng chờ hoàn tất.`,
      }
    }

    return { allowed: true }
  }

  function handleVisibilityChange(visible: boolean): void {
    isVisible.value = visible
    if (!visible) {
      clearTimer()
      if (syncStatus.value !== 'error') {
        syncStatus.value = 'paused'
      }
    } else {
      if (isStarted && auth.status === 'authenticated' && isOnline.value) {
        // Reconcile immediately upon regaining visibility before resuming edits
        void reconcile(true)
      }
    }
  }

  function handleOnlineStatusChange(online: boolean): void {
    isOnline.value = online
    if (!online) {
      clearTimer()
      syncStatus.value = 'paused'
    } else {
      if (isStarted && auth.status === 'authenticated' && isVisible.value) {
        // Reconcile immediately upon reconnecting before resuming edits
        void reconcile(true)
      }
    }
  }

  function handleAuthStatusChange(status: AuthStatus): void {
    if (status === 'authenticated') {
      if (isStarted && isVisible.value && isOnline.value) {
        void reconcile(true)
      }
    } else if (status === 'guest') {
      stop()
    }
  }

  // Watch auth status changes
  watch(
    () => auth.status,
    (newStatus) => {
      handleAuthStatusChange(newStatus)
    },
  )

  // Window event listeners
  const onVisibilityChange = () => {
    handleVisibilityChange(document.visibilityState === 'visible')
  }

  const onWindowFocus = () => {
    handleVisibilityChange(true)
  }

  const onOnline = () => {
    handleOnlineStatusChange(true)
  }

  const onOffline = () => {
    handleOnlineStatusChange(false)
  }

  function attachListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('focus', onWindowFocus)
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
    }
  }

  function detachListeners(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }

  function reset(): void {
    clearTimer()
    syncStatus.value = 'idle'
    syncError.value = null
    lastSyncedAt.value = null
    lastRevision.value = null
    lastEpoch.value = null
    lastWriteState.value = null
    inFlight.value = false
    consecutiveFailures.value = 0
    requestGeneration.value = 0
    latestCompletedRequestGeneration.value = 0
  }

  auth.registerPrivateStateReset(reset)

  async function start(): Promise<boolean> {
    if (isStarted) {
      if (auth.status === 'authenticated' && isVisible.value && isOnline.value && syncStatus.value === 'idle') {
        return await reconcile(true)
      }
      return false
    }
    isStarted = true
    attachListeners()

    if (auth.status === 'authenticated' && isVisible.value && isOnline.value) {
      return await reconcile(true)
    }
    return false
  }

  function stop(): void {
    isStarted = false
    clearTimer()
    detachListeners()
    syncStatus.value = 'idle'
  }

  return {
    syncStatus,
    syncError,
    isOnline,
    isVisible,
    lastSyncedAt,
    lastRevision,
    lastEpoch,
    lastWriteState,
    inFlight,
    consecutiveFailures,
    start,
    stop,
    poll,
    reconcile,
    reconcileBeforeWrite,
    recordMutationAck,
    reset,
    setQueryClient,
    handleVisibilityChange,
    handleOnlineStatusChange,
    handleAuthStatusChange,
  }
})
