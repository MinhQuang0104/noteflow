import { QueryClient } from '@tanstack/vue-query'
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

  it('detects higher revision, invalidates owner query caches, and does not regress revision', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await sync.start()
    expect(sync.lastRevision).toBe(1)
    invalidateSpy.mockClear()

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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['challenges'] })

    // Third poll returns revision 2 (same): does not invalidate again
    invalidateSpy.mockClear()
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 2,
      data_epoch: 1,
      write_state: 'open',
    })

    await vi.advanceTimersByTimeAsync(5000)
    expect(invalidateSpy).not.toHaveBeenCalled()

    sync.stop()
  })

  it('detects epoch change, clears query cache, and updates lastEpoch', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    const clearSpy = vi.spyOn(queryClient, 'clear')

    await sync.start()
    expect(sync.lastEpoch).toBe(1)
    clearSpy.mockClear()

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
    expect(clearSpy).toHaveBeenCalled()

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

  it('guarantees non-overlapping poll requests', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    let resolvePending: ((value: accountApi.AccountContext) => void) | null = null
    vi.spyOn(accountApi, 'getAccountContext').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePending = resolve
        }),
    )

    void sync.start()
    // First poll starts and is in flight
    expect(sync.inFlight).toBe(true)
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Try to trigger reconcile while first is still in flight: must not overlap
    const secondCallPromise = sync.reconcile()
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // Resolve first request
    resolvePending!({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'open',
    })

    await secondCallPromise
    expect(sync.inFlight).toBe(false)

    sync.stop()
  })

  it('fences late responses from older auth generation or out-of-order requests', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'
    auth.generation = 1

    let resolveSlowRequest: ((value: accountApi.AccountContext) => void) | null = null
    vi.spyOn(accountApi, 'getAccountContext').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSlowRequest = resolve
        }),
    )

    const startPromise = sync.start()
    expect(accountApi.getAccountContext).toHaveBeenCalledTimes(1)

    // While request 1 is in flight, auth generation advances
    auth.generation = 2

    // Request 1 finally resolves with revision 999
    resolveSlowRequest!({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 999,
      data_epoch: 1,
      write_state: 'open',
    })

    await startPromise

    // The late response must be discarded by generation fence: lastRevision should NOT become 999
    expect(sync.lastRevision).toBeNull()

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

  it('records mutation ACK: updates revision and invalidates affected queries', () => {
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    sync.recordMutationAck(5, 1)

    expect(sync.lastRevision).toBe(5)
    expect(sync.lastEpoch).toBe(1)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['challenges'] })
  })

  it('reconcileBeforeWrite validates open write_state and fresh context', async () => {
    const auth = useAuthStore()
    const sync = useSyncStore()
    sync.setQueryClient(queryClient)
    auth.status = 'authenticated'

    // Successful open state
    const result = await sync.reconcileBeforeWrite()
    expect(result.allowed).toBe(true)

    // When write_state is not open
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValueOnce({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: '2026-09-19',
      week: { start_date: '2026-09-15', end_date: '2026-09-21' },
      account_revision: 1,
      data_epoch: 1,
      write_state: 'locked_for_import',
    })

    const blockedResult = await sync.reconcileBeforeWrite()
    expect(blockedResult.allowed).toBe(false)
    expect(blockedResult.reason).toContain('locked_for_import')
  })
})
