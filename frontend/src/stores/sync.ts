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
  const pendingConvergence = ref<boolean>(false)

  // Internal concurrency & generation tracking
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let isStarted = false
  const requestGeneration = ref<number>(0)
  const latestCompletedRequestGeneration = ref<number>(0)
  let activeReconcileInfo: { promise: Promise<boolean>; authGen: number } | null = null

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
    if (auth.status !== 'authenticated') {
      syncStatus.value = 'idle'
      return false
    }

    if (!isVisible.value || !isOnline.value) {
      syncStatus.value = 'paused'
      return false
    }

    inFlight.value = true
    syncStatus.value = 'syncing'

    const capturedAuthGen = auth.generation
    const currentReqGen = ++requestGeneration.value

    try {
      const nextContext: AccountContext = await accountApi.getAccountContext()

      // Fencing check 1: Auth generation rotated or status changed while request was in flight (S14-F02)
      if (auth.generation !== capturedAuthGen || auth.status !== 'authenticated') {
        return false
      }

      // Fencing check 2: Newer request already finished (out of order response)
      if (currentReqGen < latestCompletedRequestGeneration.value) {
        return false
      }
      latestCompletedRequestGeneration.value = currentReqGen

      // Lifecycle check (S14-F01, S14-F05): If hidden or offline while /account was pending, pause and do not start downstream refetch!
      if (!isVisible.value || !isOnline.value) {
        syncStatus.value = 'paused'
        return false
      }

      // Cache invalidation & epoch change handling (S14-F02, S14-F03, S14-F04)
      const prevRevision = lastRevision.value
      const prevEpoch = lastEpoch.value
      const epochChanged = prevEpoch !== null && nextContext.data_epoch !== prevEpoch
      const revisionAdvanced = prevRevision !== null && nextContext.account_revision > prevRevision
      const needsConvergence = epochChanged || revisionAdvanced || pendingConvergence.value

      // Monotonic revision check: if same epoch, do NOT regress revision on late responses
      if (prevEpoch === null || nextContext.data_epoch === prevEpoch) {
        if (prevRevision !== null && nextContext.account_revision < prevRevision) {
          // Keep prevRevision, do not regress
        } else {
          lastRevision.value = nextContext.account_revision
        }
      } else {
        lastRevision.value = nextContext.account_revision
      }

      lastEpoch.value = nextContext.data_epoch
      lastWriteState.value = nextContext.write_state
      lastSyncedAt.value = new Date()

      // Update account store context with preserved monotonic revision
      account.context = {
        ...nextContext,
        account_revision: lastRevision.value ?? nextContext.account_revision,
        data_epoch: nextContext.data_epoch,
      }
      account.status = 'ready'

      // Observable query convergence (S14-F03, S14-F04)
      if (needsConvergence) {
        try {
          if (epochChanged) {
            // S14-F03, S14-F04: resetQueries preserves active query listeners; throwOnError ensures failures reject
            await currentQueryClient.resetQueries({ queryKey: ['challenges'] }, { throwOnError: true })
          } else {
            // S14-F04: throwOnError ensures refetch rejection is not swallowed by TanStack Query
            await currentQueryClient.refetchQueries({ queryKey: ['challenges'] }, { throwOnError: true })
          }

          // Boundary check after async refetch (S14-F02)
          if (auth.generation !== capturedAuthGen || auth.status !== 'authenticated') {
            return false
          }

          // Lifecycle check after refetch (S14-F01, S14-F05)
          if (!isVisible.value || !isOnline.value) {
            syncStatus.value = 'paused'
            return false
          }

          pendingConvergence.value = false
        } catch {
          // S14-F04: Invalidation failure leaves coordinator in error state and retries on equal revision
          pendingConvergence.value = true
          consecutiveFailures.value++
          syncError.value = 'Không thể đồng bộ danh sách challenge mới nhất. Đang thử lại...'
          syncStatus.value = 'error'
          return false
        }
      } else {
        pendingConvergence.value = false
      }

      consecutiveFailures.value = 0
      syncError.value = null
      syncStatus.value = 'synced'

      return true
    } catch (error: unknown) {
      // Fencing check: auth changed during flight
      if (auth.generation !== capturedAuthGen || auth.status !== 'authenticated') {
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

    if (auth.generation !== capturedAuthGen || !isStarted || auth.status !== 'authenticated') return

    if (isVisible.value && isOnline.value) {
      scheduleNextPoll(success ? BASE_POLL_INTERVAL_MS : getBackoffDelay())
    }
  }

  async function reconcile(force = false): Promise<boolean> {
    clearTimer()
    if (force) {
      consecutiveFailures.value = 0
      syncError.value = null
    }

    if (!isOnline.value || !isVisible.value) {
      syncStatus.value = 'paused'
      return false
    }

    if (auth.status !== 'authenticated') {
      syncStatus.value = 'idle'
      return false
    }

    // S14-F05: If transport is in flight, await it without overlapping requests
    while (activeReconcileInfo) {
      const { promise: inFlightPromise, authGen: inFlightAuthGen } = activeReconcileInfo
      const priorResult = await inFlightPromise
      // If the in-flight request was started for the CURRENT auth generation, return its result
      if (inFlightAuthGen === auth.generation && auth.status === 'authenticated') {
        return priorResult
      }
      // Otherwise (old transport belonged to a prior session/generation), recheck lifecycle
      if (!isStarted || auth.status !== 'authenticated') {
        return false
      }
      if (!isOnline.value || !isVisible.value) {
        syncStatus.value = 'paused'
        return false
      }
      // If another caller already created a new activeReconcileInfo for current generation, loop will await it!
    }

    const capturedAuthGen = auth.generation
    let currentPromise: Promise<boolean> | null = null
    currentPromise = (async () => {
      try {
        return await reconcileInternal()
      } finally {
        if ((activeReconcileInfo as { promise: Promise<boolean>; authGen: number } | null)?.promise === currentPromise) {
          activeReconcileInfo = null
        }
      }
    })()

    activeReconcileInfo = { promise: currentPromise, authGen: capturedAuthGen }
    const success = await currentPromise

    if (auth.generation !== capturedAuthGen || auth.status !== 'authenticated') return false

    if (isStarted && isVisible.value && isOnline.value) {
      scheduleNextPoll(success ? BASE_POLL_INTERVAL_MS : getBackoffDelay())
    }

    return success
  }

  async function recordMutationAck(
    revision: number,
    epoch: number,
    originatingAuthGen?: number,
  ): Promise<boolean> {
    // S14-F02: Auth generation fencing for mutation ACKs
    if (originatingAuthGen !== undefined && originatingAuthGen !== auth.generation) {
      return false
    }
    if (auth.status !== 'authenticated') {
      return false
    }

    // S14-F02: Epoch check to discard stale ACKs from previous epochs
    if (lastEpoch.value !== null && epoch < lastEpoch.value) {
      return false
    }

    if (lastEpoch.value === null || epoch === lastEpoch.value) {
      lastRevision.value = lastRevision.value !== null ? Math.max(lastRevision.value, revision) : revision
    } else {
      lastRevision.value = revision
    }
    lastEpoch.value = epoch

    if (account.context) {
      account.context = {
        ...account.context,
        account_revision: lastRevision.value,
        data_epoch: epoch,
      }
    }

    // Await query invalidation / refetch with throwOnError: true (S14-F02, S14-F04)
    try {
      await currentQueryClient.invalidateQueries({ queryKey: ['challenges'] }, { throwOnError: true })

      // S14-F02: Re-fence originating auth generation/status and epoch AFTER awaited invalidation!
      if (
        (originatingAuthGen !== undefined && originatingAuthGen !== auth.generation) ||
        auth.status !== 'authenticated' ||
        (lastEpoch.value !== null && epoch < lastEpoch.value)
      ) {
        return false
      }

      consecutiveFailures.value = 0
      syncError.value = null
      pendingConvergence.value = false
      syncStatus.value = 'synced'
      return true
    } catch {
      // S14-F02: If auth changed while invalidation failed, do not mutate new session state
      if (
        (originatingAuthGen !== undefined && originatingAuthGen !== auth.generation) ||
        auth.status !== 'authenticated'
      ) {
        return false
      }

      pendingConvergence.value = true
      consecutiveFailures.value++
      syncError.value = 'Không thể đồng bộ danh sách challenge mới nhất. Đang thử lại...'
      syncStatus.value = 'error'
      return false
    }
  }

  async function reconcileBeforeWrite(): Promise<{ allowed: boolean; reason?: string }> {
    // S14-F01: Guard connectivity & visibility before attempting write
    if (!isOnline.value) {
      return {
        allowed: false,
        reason: 'Không thể kết nối mạng. Vui lòng kiểm tra đường truyền và thử lại.',
      }
    }
    if (!isVisible.value) {
      return {
        allowed: false,
        reason: 'Ứng dụng đang ở trạng thái ẩn. Vui lòng quay lại ứng dụng để đồng bộ trước khi ghi.',
      }
    }
    if (auth.status !== 'authenticated') {
      return {
        allowed: false,
        reason: 'Phiên làm việc chưa được xác thực. Vui lòng đăng nhập lại.',
      }
    }

    const startAuthGen = auth.generation
    let ok = false
    try {
      ok = await reconcile(true)
    } catch {
      ok = false
    }

    // S14-F01: Fail closed if reconcile returned false, auth changed, or connection/visibility dropped mid-flight
    if (
      !ok ||
      auth.generation !== startAuthGen ||
      auth.status !== 'authenticated' ||
      !isOnline.value ||
      !isVisible.value ||
      syncStatus.value === 'paused' ||
      syncStatus.value === 'error'
    ) {
      return {
        allowed: false,
        reason: 'Không thể đồng bộ trạng thái mới nhất trước khi ghi. Vui lòng thử lại.',
      }
    }

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
      // S14-F05: Ensure coordinator starts/resumes on re-login even without page remount
      void start()
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
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange)
      }
      window.addEventListener('focus', onWindowFocus)
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
    }
  }

  function detachListeners(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('visibilitychange', onVisibilityChange)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
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
    pendingConvergence.value = false
    consecutiveFailures.value = 0
    requestGeneration.value++
    latestCompletedRequestGeneration.value = 0
  }

  auth.registerPrivateStateReset(reset)

  async function start(): Promise<boolean> {
    if (isStarted) {
      if (auth.status === 'authenticated' && isVisible.value && isOnline.value && (syncStatus.value === 'idle' || syncStatus.value === 'paused')) {
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
    requestGeneration.value++
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
    pendingConvergence,
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
