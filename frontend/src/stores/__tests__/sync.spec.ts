import { QueryClient, QueryObserver } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as accountApi from '../../api/account'
import { useAccountStore } from '../account'
import { useAuthStore } from '../auth'
import { useSyncStore } from '../sync'

describe('useSyncStore', () => {
  let queryClient: QueryClient
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    vi.useFakeTimers()
    pinia = createPinia()
    setActivePinia(pinia)
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    // Default mock account context
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValue({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('initializes in idle state and starts polling when authenticated', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)

    expect(sync.syncStatus).toBe('idle')

    auth.status = 'authenticated'
    await sync.start()

    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)
    expect(sync.lastRevision).toBe(1)
    expect(sync.lastEpoch).toBe(1)
    expect(sync.lastWriteState).toBe('open')
    expect(sync.syncStatus).toBe('synced')
    expect(sync.syncError).toBeNull()

    // Advance 5 seconds: second poll executes
    await vi.advanceTimersByTimeAsync(5000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(2)

    sync.stop()
  })

  it('detects higher revision, refetches query caches, and does not regress revision', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue()

    await sync.start()
    expect(sync.lastRevision).toBe(1)
    refetchSpy.mockClear()

    // Second poll returns revision 2
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })

    await vi.advanceTimersByTimeAsync(5000)

    expect(sync.lastRevision).toBe(2)
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: ['challenges'] }, { throwOnError: true })

    // Third poll returns revision 2 (same): does not refetch again
    refetchSpy.mockClear()
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })

    await vi.advanceTimersByTimeAsync(5000)
    expect(refetchSpy).not.toHaveBeenCalled()

    sync.stop()
  })

  it('detects epoch change, resets queries, and updates lastEpoch (S14-F03)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    const resetSpy = vi.spyOn(queryClient, 'resetQueries').mockResolvedValue()

    await sync.start()
    expect(sync.lastEpoch).toBe(1)
    resetSpy.mockClear()

    // Epoch changes to 2
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 2,
      write_state: 'open',
    })

    await vi.advanceTimersByTimeAsync(5000)

    expect(sync.lastEpoch).toBe(2)
    expect(resetSpy).toHaveBeenCalledWith({ queryKey: ['challenges'] }, { throwOnError: true })

    sync.stop()
  })

  it('pauses polling when document becomes hidden, resumes and reconciles on visible', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    await sync.start()
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Simulate tab hidden
    sync.handleVisibilityChange(false)
    expect(sync.isVisible).toBe(false)
    expect(sync.syncStatus).toBe('paused')

    // Advance 15 seconds: no polling occurs while hidden
    await vi.advanceTimersByTimeAsync(15000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Tab becomes visible: immediate reconcile happens
    sync.handleVisibilityChange(true)
    expect(sync.isVisible).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(2)

    sync.stop()
  })

  it('pauses polling when offline, resumes and reconciles on online (AC2)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    await sync.start()
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Offline event
    sync.handleOnlineStatusChange(false)
    expect(sync.isOnline).toBe(false)
    expect(sync.syncStatus).toBe('paused')

    // Advance 15 seconds: no polling occurs while offline
    await vi.advanceTimersByTimeAsync(15000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Online event: immediate reconcile happens
    sync.handleOnlineStatusChange(true)
    expect(sync.isOnline).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(2)

    sync.stop()
  })

  it('stops polling immediately on logout or 401', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    await sync.start()
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Log out
    auth.status = 'guest'
    sync.handleAuthStatusChange('guest')

    await vi.advanceTimersByTimeAsync(15000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Test 401 handling
    auth.status = 'authenticated'
    const refreshSessionSpy = vi.spyOn(auth, 'refreshSession').mockResolvedValue(false)
    vi.spyOn(accountApi, 'getAccountContext').mockRejectedValueOnce({ status: 401 })

    await sync.start()

    expect(refreshSessionSpy).toHaveBeenCalled()
    expect(sync.syncStatus).toBe('idle')

    sync.stop()
  })

  it('joins active in-flight reconcile promise instead of returning false immediately (S14-F01)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    let resolveSlowCall: ((value: accountApi.AccountContext) => void) | null = null
    vi.spyOn(accountApi, 'getAccountContext').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSlowCall = resolve
        }),
    )

    // First call starts reconcile and is in flight
    const p1 = sync.reconcile()
    expect(sync.inFlight).toBe(true)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Second call starts while first is in flight: it must JOIN the in-flight promise
    const p2 = sync.reconcile()
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    resolveSlowCall!({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    })

    const [res1, res2] = await Promise.all([p1, p2])
    expect(res1).toBe(true)
    expect(res2).toBe(true)
    expect(sync.inFlight).toBe(false)

    sync.stop()
  })

  it('reconcileBeforeWrite fails closed when cached context is ready/open but reconcile fails (S14-F01)', async () => {
    const auth = useAuthStore()
    const account = useAccountStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    // Seed account store with cached open context
    account.context = {
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    }
    account.status = 'ready'

    // Server request now fails
    vi.spyOn(accountApi, 'getAccountContext').mockRejectedValueOnce(new Error('Network disconnected'))

    // reconcileBeforeWrite MUST fail closed and not blindly allow write based on stale cache
    const check = await sync.reconcileBeforeWrite()
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('Không thể đồng bộ')

    sync.stop()
  })

  it('reconcileBeforeWrite fails closed when offline or hidden (S14-F01)', async () => {
    const auth = useAuthStore()
    const account = useAccountStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    account.context = {
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    }
    account.status = 'ready'

    // Offline test
    sync.handleOnlineStatusChange(false)
    const offlineCheck = await sync.reconcileBeforeWrite()
    expect(offlineCheck.allowed).toBe(false)
    expect(offlineCheck.reason).toContain('kết nối mạng')

    sync.handleOnlineStatusChange(true)

    // Hidden test
    sync.handleVisibilityChange(false)
    const hiddenCheck = await sync.reconcileBeforeWrite()
    expect(hiddenCheck.allowed).toBe(false)
    expect(hiddenCheck.reason).toContain('ẩn')

    sync.stop()
  })

  it('prevents stale account response from overwriting newer mutation ACK (S14-F02)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    await sync.start()
    expect(sync.lastRevision).toBe(1)

    // Client performs mutation and records ACK at revision 3
    sync.recordMutationAck(3, 1, auth.generation)
    expect(sync.lastRevision).toBe(3)

    // Server poll returns stale revision 2 (e.g. from replica lag or delayed request)
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })

    await vi.advanceTimersByTimeAsync(5000)

    // lastRevision MUST NOT regress to 2!
    expect(sync.lastRevision).toBe(3)

    sync.stop()
  })

  it('discards stale mutation ACK with outdated auth generation or older epoch (S14-F02)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'
    auth.generation = 2

    await sync.start()
    expect(sync.lastRevision).toBe(1)

    // Mutation ACK from previous session (generation 1) is discarded
    sync.recordMutationAck(5, 1, 1)
    expect(sync.lastRevision).toBe(1)

    // Mutation ACK from newer session (generation 2) is accepted
    sync.recordMutationAck(5, 1, 2)
    expect(sync.lastRevision).toBe(5)

    // Mutation ACK with older epoch is discarded
    sync.lastEpoch = 2
    sync.recordMutationAck(10, 1, 2)
    expect(sync.lastRevision).toBe(5)

    sync.stop()
  })

  it('fences auth generation changes during async query refetch (S14-F02)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'
    auth.generation = 1

    await sync.start()

    let resolveRefetch: (() => void) | null = null
    vi.spyOn(queryClient, 'refetchQueries').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve
        }),
    )

    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })

    const pollPromise = sync.reconcile()
    await vi.advanceTimersByTimeAsync(1)

    // While refetch is pending, user logs out / rotates generation
    auth.generation = 2
    resolveRefetch!()

    const result = await pollPromise
    // Must return false and not mark as synced
    expect(result).toBe(false)

    sync.stop()
  })

  it('handles invalidation failure: sets error status, tracks pendingConvergence, and retries on equal revision (S14-F04)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    await sync.start()
    expect(sync.syncStatus).toBe('synced')

    // Refetch fails with network error
    vi.spyOn(queryClient, 'refetchQueries').mockRejectedValueOnce(new Error('Refetch failed'))

    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })

    await vi.advanceTimersByTimeAsync(5000)

    expect(sync.syncStatus).toBe('error')
    expect(sync.pendingConvergence).toBe(true)

    // Next poll: server still returns revision 2 (no new mutations)
    // Because pendingConvergence is true, coordinator MUST retry refetch!
    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValueOnce()
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })

    // Advance through backoff delay
    await vi.advanceTimersByTimeAsync(10000)

    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: ['challenges'] }, { throwOnError: true })
    expect(sync.pendingConvergence).toBe(false)
    expect(sync.syncStatus).toBe('synced')

    sync.stop()
  })

  it('re-login without page remount restarts coordinator (S14-F05)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    await sync.start()
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // User logs out
    auth.status = 'guest'
    sync.handleAuthStatusChange('guest')
    expect(sync.syncStatus).toBe('idle')

    // Advance time: no polls
    await vi.advanceTimersByTimeAsync(15000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // User logs in again in same SPA session (no page remount)
    auth.status = 'authenticated'
    sync.handleAuthStatusChange('authenticated')
    await vi.advanceTimersByTimeAsync(1)

    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(2)
    expect(sync.syncStatus).toBe('synced')

    sync.stop()
  })

  it('hidden transition mid-request preserves paused state (S14-F05)', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    let resolveContext: ((value: accountApi.AccountContext) => void) | null = null
    vi.spyOn(accountApi, 'getAccountContext').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveContext = resolve
        }),
    )

    const startPromise = sync.start()
    expect(sync.inFlight).toBe(true)

    // Tab becomes hidden mid-flight
    sync.handleVisibilityChange(false)
    expect(sync.isVisible).toBe(false)

    // Context resolves
    resolveContext!({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    })

    await startPromise
    // Must preserve paused state, NOT claim synced!
    expect(sync.syncStatus).toBe('paused')

    sync.stop()
  })

  it('applies bounded backoff on errors and does not wipe valid data (AC4)', async () => {
    const auth = useAuthStore()
    const account = useAccountStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    // First call succeeds: sets baseline data
    await sync.start()
    expect(sync.syncStatus).toBe('synced')
    expect(account.context).not.toBeNull()

    // Subsequent calls fail with 500 error
    vi.spyOn(accountApi, 'getAccountContext').mockRejectedValue(new Error('Network error'))

    // Advance 5 seconds: attempt 1 fails -> backoff delay becomes 10s
    await vi.advanceTimersByTimeAsync(5000)
    expect(sync.syncStatus).toBe('error')
    expect(sync.syncError).toBeTruthy()
    // Valid data is PRESERVED (AC4)!
    expect(account.context).not.toBeNull()

    // Advance 5 seconds: nothing should fire yet because backoff is 10s
    await vi.advanceTimersByTimeAsync(5000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(2)

    // Advance remaining 5 seconds (total 10s from failure): attempt 2 fires and fails -> backoff 20s
    await vi.advanceTimersByTimeAsync(5000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(3)

    // Advance 10s: nothing should fire yet because backoff is 20s
    await vi.advanceTimersByTimeAsync(10000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(3)

    // Advance another 10s (total 20s): attempt 3 fires -> backoff capped at 30s
    await vi.advanceTimersByTimeAsync(10000)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(4)

    // Manual retry with reconcile(true) immediately attempts and resets backoff
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 3,
      data_epoch: 1,
      write_state: 'open',
    })

    await sync.reconcile(true)
    expect(sync.syncStatus).toBe('synced')
    expect(sync.syncError).toBeNull()
    expect(sync.lastRevision).toBe(3)

    sync.stop()
  })

  it('S14-F04 real QueryClient refetch failure must remain observable', async () => {
    const sync = useSyncStore()
    const auth = useAuthStore()
    auth.status = 'authenticated'
    sync.setQueryClient(queryClient)

    const observer = new QueryObserver(queryClient, {
      queryKey: ['challenges'],
      queryFn: async () => {
        throw new Error('server down')
      },
      initialData: { challenges: [{ id: 'existing' }] },
      retry: false,
    })
    const unsubscribe = observer.subscribe(() => {})

    try {
      await sync.start()
      vi.mocked(accountApi.getAccountContext).mockResolvedValueOnce({
        timezone: 'Asia/Ho_Chi_Minh',
        account_date: '2026-09-19',
        week: { start_date: '2026-09-15', end_date: '2026-09-21' },
        account_revision: 2,
        data_epoch: 1,
        write_state: 'open',
      })
      const result = await sync.reconcile()

      expect(result).toBe(false)
      expect(sync.syncStatus).toBe('error')
      expect(sync.pendingConvergence).toBe(true)
      expect(queryClient.getQueryData(['challenges'])).toEqual({ challenges: [{ id: 'existing' }] })
    } finally {
      unsubscribe()
      sync.stop()
    }
  })

  it('S14-F05 hidden transition must not start Challenge refetch after account response', async () => {
    const sync = useSyncStore()
    const auth = useAuthStore()
    auth.status = 'authenticated'
    sync.setQueryClient(queryClient)

    let resolveAccount!: (value: accountApi.AccountContext) => void
    vi.mocked(accountApi.getAccountContext).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAccount = resolve
        }),
    )
    const refetch = vi.spyOn(queryClient, 'refetchQueries')

    sync.lastRevision = 1
    sync.lastEpoch = 1
    const pending = sync.start()
    sync.handleVisibilityChange(false)
    resolveAccount({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })
    await pending

    expect(refetch).not.toHaveBeenCalled()
    expect(sync.syncStatus).toBe('paused')
    sync.stop()
  })

  it('S14-F01 reconcile-before-write fails closed if connection drops mid-reconcile', async () => {
    const sync = useSyncStore()
    const auth = useAuthStore()
    const account = useAccountStore()
    auth.status = 'authenticated'
    sync.setQueryClient(queryClient)
    account.context = {
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    }
    account.status = 'ready'

    let resolveAccount!: (value: accountApi.AccountContext) => void
    vi.mocked(accountApi.getAccountContext).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAccount = resolve
        }),
    )

    const pending = sync.reconcileBeforeWrite()
    sync.handleOnlineStatusChange(false)
    resolveAccount({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    })

    expect((await pending).allowed).toBe(false)
    sync.stop()
  })

  it('S14-F05 stop and relogin never overlap account requests', async () => {
    const sync = useSyncStore()
    const auth = useAuthStore()
    auth.status = 'authenticated'
    sync.setQueryClient(queryClient)

    let resolveFirst!: (value: accountApi.AccountContext) => void
    vi.mocked(accountApi.getAccountContext).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )

    const first = sync.start()
    sync.stop()
    auth.generation += 1
    auth.status = 'guest'
    auth.generation += 1
    auth.status = 'authenticated'
    const second = sync.start()

    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)
    resolveFirst({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    })
    await first
    await second
    sync.stop()
  })
})
