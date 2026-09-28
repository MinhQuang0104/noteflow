import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as challengesApi from '../../api/challenges'
import * as accountApi from '../../api/account'
import * as authApi from '../../api/auth'
import { useAccountStore } from '../account'
import { useAuthStore } from '../auth'
import { useJournalDraftsStore } from '../journalDrafts'
import { useSyncStore } from '../sync'

const DATE = '2026-09-27'

function snapshot(
  challengeId: string,
  journal: string | null,
  journalVersion: number,
): challengesApi.JournalSnapshot {
  return { challenge_id: challengeId, local_date: DATE, journal, journal_version: journalVersion }
}

function mutation(
  challengeId: string,
  journal: string | null,
  journalVersion: number,
  dataEpoch = 4,
): challengesApi.JournalMutationResult {
  return {
    journal: snapshot(challengeId, journal, journalVersion),
    account_revision: 12,
    data_epoch: dataEpoch,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useJournalDraftsStore', () => {
  let drafts: ReturnType<typeof useJournalDraftsStore>
  let auth: ReturnType<typeof useAuthStore>
  let account: ReturnType<typeof useAccountStore>
  let sync: ReturnType<typeof useSyncStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    auth = useAuthStore()
    account = useAccountStore()
    sync = useSyncStore()
    drafts = useJournalDraftsStore()

    auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
    auth.status = 'authenticated'
    auth.generation = 3
    account.status = 'ready'
    account.context = {
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: DATE,
      week: { start_date: '2026-09-21', end_date: '2026-09-27' },
      account_revision: 11,
      data_epoch: 4,
      write_state: 'open',
    }
    vi.spyOn(sync, 'reconcileBeforeWrite').mockResolvedValue({ allowed: true })
    vi.spyOn(sync, 'recordMutationAck').mockResolvedValue(true)
    vi.spyOn(challengesApi, 'generateCommandId').mockReturnValue('command-1')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks a changed journal dirty immediately after an acknowledged save', async () => {
    vi.spyOn(challengesApi, 'saveChallengeJournal').mockResolvedValue(mutation('challenge-a', 'saved text', 2))
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'saved text')

    await drafts.save('challenge-a', DATE)
    drafts.setDraftText('challenge-a', DATE, 'edited after save')

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'edited after save',
      status: 'dirty',
      clientRevision: 2,
      acknowledgedClientRevision: 1,
    })
  })

  it('keeps a newer edit dirty when an older revision is acknowledged', async () => {
    const response = deferred<challengesApi.JournalMutationResult>()
    vi.spyOn(challengesApi, 'saveChallengeJournal').mockReturnValue(response.promise)
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'revision one')

    const saving = drafts.save('challenge-a', DATE)
    await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())
    drafts.setDraftText('challenge-a', DATE, 'revision two')
    response.resolve(mutation('challenge-a', 'revision one', 2))
    await saving

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'revision two',
      journalVersion: 2,
      clientRevision: 2,
      acknowledgedClientRevision: 1,
      status: 'dirty',
    })
  })

  it('keeps resource drafts separate and ignores refetches over dirty text and version', () => {
    drafts.hydrate(snapshot('challenge-a', 'server A', 3))
    drafts.hydrate(snapshot('challenge-b', 'server B', 8))
    drafts.setDraftText('challenge-a', DATE, 'local A')

    drafts.hydrate(snapshot('challenge-a', 'refetched A', 9))

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'local A',
      journalVersion: 3,
      status: 'dirty',
    })
    expect(drafts.getDraft('challenge-b', DATE)).toMatchObject({
      text: 'server B',
      journalVersion: 8,
      status: 'saved',
    })
  })

  it('rebases only after an explicit epoch refresh while preserving dirty text', () => {
    drafts.hydrate(snapshot('challenge-a', 'old server text', 3))
    drafts.setDraftText('challenge-a', DATE, 'local draft')
    account.context!.data_epoch = 5

    drafts.rebaseAfterEpochChange('challenge-a', DATE, snapshot('challenge-a', 'restored server text', 7))

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'local draft',
      acknowledgedText: 'restored server text',
      journalVersion: 7,
      dataEpoch: 5,
      status: 'dirty',
      pendingCommand: null,
    })
  })

  it('does not expose a draft to another owner', () => {
    drafts.hydrate(snapshot('challenge-a', 'owner 42', 1))
    drafts.setDraftText('challenge-a', DATE, 'private draft')
    auth.owner = { id: 43, name: 'Other owner', email: 'other@example.test' }

    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
    drafts.hydrate(snapshot('challenge-a', 'owner 43', 7))
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({ text: 'owner 43', ownerId: 43 })

    auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({ text: 'private draft', ownerId: 42 })
  })

  it('serializes double submissions from preflight through the server acknowledgement', async () => {
    const preflight = deferred<{ allowed: boolean; reason?: string }>()
    const response = deferred<challengesApi.JournalMutationResult>()
    vi.mocked(sync.reconcileBeforeWrite).mockReturnValue(preflight.promise)
    vi.spyOn(challengesApi, 'saveChallengeJournal').mockReturnValue(response.promise)
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'draft')

    const first = drafts.save('challenge-a', DATE)
    const second = drafts.save('challenge-a', DATE)
    await Promise.resolve()

    expect(sync.reconcileBeforeWrite).toHaveBeenCalledOnce()
    expect(challengesApi.saveChallengeJournal).not.toHaveBeenCalled()

    preflight.resolve({ allowed: true })
    await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())
    response.resolve(mutation('challenge-a', 'draft', 2))
    await Promise.all([first, second])

    expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce()
  })

  it('replays an uncertain command unchanged before allowing a newer revision to save', async () => {
    const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    save.mockRejectedValueOnce(new TypeError('network timeout'))
    save.mockResolvedValueOnce(mutation('challenge-a', 'first revision', 2))
    save.mockResolvedValueOnce(mutation('challenge-a', 'second revision', 3))
    vi.mocked(challengesApi.generateCommandId)
      .mockReturnValueOnce('command-original')
      .mockReturnValueOnce('command-newer')
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'first revision')

    await drafts.save('challenge-a', DATE)
    const originalRequest = save.mock.calls[0]
    drafts.setDraftText('challenge-a', DATE, 'second revision')
    await drafts.save('challenge-a', DATE)

    expect(save.mock.calls[1]).toEqual(originalRequest)
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'second revision',
      journalVersion: 2,
      clientRevision: 2,
      acknowledgedClientRevision: 1,
      status: 'dirty',
      pendingCommand: null,
    })
    expect(save).toHaveBeenCalledTimes(2)

    await drafts.save('challenge-a', DATE)

    expect(save).toHaveBeenCalledTimes(3)
    expect(save.mock.calls[2]?.[2]).toMatchObject({
      command_id: 'command-newer',
      data_epoch: 4,
      base_version: 2,
      journal: 'second revision',
    })
  })

  it('does not apply a late acknowledgement after the authentication generation changes', async () => {
    const response = deferred<challengesApi.JournalMutationResult>()
    vi.spyOn(challengesApi, 'saveChallengeJournal').mockReturnValue(response.promise)
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'pending draft')

    const saving = drafts.save('challenge-a', DATE)
    await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())
    auth.generation += 1
    response.resolve(mutation('challenge-a', 'pending draft', 2))
    await saving

    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
    expect(Object.values(drafts.drafts)[0]).toMatchObject({
      text: 'pending draft',
      journalVersion: 1,
      acknowledgedClientRevision: 0,
      status: 'quarantined',
    })
    expect(sync.recordMutationAck).not.toHaveBeenCalled()
  })

  it('does not apply a late transport error after the authentication generation changes', async () => {
    const response = deferred<challengesApi.JournalMutationResult>()
    vi.spyOn(challengesApi, 'saveChallengeJournal').mockReturnValue(response.promise)
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'pending draft')

    const saving = drafts.save('challenge-a', DATE)
    await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())
    auth.generation += 1
    response.reject(new TypeError('network timeout'))
    await saving

    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
    expect(Object.values(drafts.drafts)[0]).toMatchObject({
      status: 'quarantined',
      error: { kind: 'stale_context' },
    })
  })

  it('does not apply a late acknowledgement from an earlier data epoch', async () => {
    const response = deferred<challengesApi.JournalMutationResult>()
    vi.spyOn(challengesApi, 'saveChallengeJournal').mockReturnValue(response.promise)
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'pending draft')

    const saving = drafts.save('challenge-a', DATE)
    await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())
    account.context!.data_epoch = 5
    response.resolve(mutation('challenge-a', 'pending draft', 2, 4))
    await saving

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'pending draft',
      journalVersion: 1,
      acknowledgedClientRevision: 0,
      status: 'quarantined',
    })
    expect(sync.recordMutationAck).not.toHaveBeenCalled()
  })

  it('does not apply a late transport error from an earlier data epoch', async () => {
    const response = deferred<challengesApi.JournalMutationResult>()
    vi.spyOn(challengesApi, 'saveChallengeJournal').mockReturnValue(response.promise)
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'pending draft')

    const saving = drafts.save('challenge-a', DATE)
    await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())
    account.context!.data_epoch = 5
    response.reject(new TypeError('network timeout'))
    await saving

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      status: 'quarantined',
      error: { kind: 'stale_context' },
    })
  })

  it('does not submit an existing draft in a different authentication generation', async () => {
    const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    drafts.hydrate(snapshot('challenge-a', 'original', 1))
    drafts.setDraftText('challenge-a', DATE, 'private draft')
    auth.generation += 1

    await drafts.save('challenge-a', DATE)

    expect(sync.reconcileBeforeWrite).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
    expect(Object.values(drafts.drafts)[0]).toMatchObject({ status: 'quarantined' })
  })

  it('keeps an expired draft hidden until same-owner epoch and version reconciliation, then replays the same command', async () => {
    const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    save
      .mockRejectedValueOnce(new TypeError('network timeout'))
      .mockResolvedValueOnce(mutation('challenge-a', 'private draft', 2))
    const base = snapshot('challenge-a', 'server baseline', 1)
    drafts.hydrate(base)
    drafts.setDraftText('challenge-a', DATE, 'private draft')

    await drafts.save('challenge-a', DATE)
    const originalRequest = save.mock.calls[0]
    expect(originalRequest).toBeDefined()
    expect(drafts.getDraft('challenge-a', DATE)?.pendingCommand?.request).toEqual(originalRequest?.[2])

    vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
    await auth.refreshSession()

    expect(auth.status).toBe('guest')
    expect(account.context).toBeNull()
    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
    expect(Object.values(drafts.drafts)).toMatchObject([
      { text: 'private draft', status: 'quarantined', pendingCommand: { request: originalRequest?.[2] } },
    ])

    vi.spyOn(authApi, 'login').mockResolvedValue({
      owner: { id: 42, name: 'Owner', email: 'owner@example.test' },
      redirect_to: '/challenges',
    } as authApi.LoginResult)
    await auth.logIn({ email: 'owner@example.test', password: 'secret' })
    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()

    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValue({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: DATE,
      week: { start_date: '2026-09-21', end_date: '2026-09-27' },
      account_revision: 12,
      data_epoch: 4,
      write_state: 'open',
    })
    await account.refresh()
    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()

    drafts.hydrate(base)
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'private draft',
      status: 'error',
      pendingCommand: { request: originalRequest?.[2] },
    })

    await drafts.save('challenge-a', DATE)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]).toEqual(originalRequest)
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'private draft',
      status: 'saved',
      acknowledgedClientRevision: 1,
      pendingCommand: null,
    })
  })

  it('keeps an expired draft quarantined when the owner returns in a different data epoch', async () => {
    const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    save.mockRejectedValueOnce(new TypeError('network timeout'))
    const base = snapshot('challenge-a', 'server baseline', 1)
    drafts.hydrate(base)
    drafts.setDraftText('challenge-a', DATE, 'private draft')

    await drafts.save('challenge-a', DATE)
    const originalRequest = save.mock.calls[0]?.[2]
    expect(originalRequest).toBeDefined()

    vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
    await auth.refreshSession()
    vi.spyOn(authApi, 'login').mockResolvedValue({
      owner: { id: 42, name: 'Owner', email: 'owner@example.test' },
      redirect_to: '/challenges',
    } as authApi.LoginResult)
    await auth.logIn({ email: 'owner@example.test', password: 'secret' })
    vi.spyOn(accountApi, 'getAccountContext').mockResolvedValue({
      timezone: 'Asia/Ho_Chi_Minh',
      account_date: DATE,
      week: { start_date: '2026-09-21', end_date: '2026-09-27' },
      account_revision: 13,
      data_epoch: 5,
      write_state: 'open',
    })
    await account.refresh()

    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
    drafts.hydrate(snapshot('challenge-a', 'new epoch server text', 7))
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'private draft',
      dataEpoch: 4,
      status: 'quarantined',
      pendingCommand: { request: originalRequest },
    })

    await drafts.save('challenge-a', DATE)

    expect(save).toHaveBeenCalledOnce()
    expect(save.mock.calls[0]?.[2]).toEqual(originalRequest)
  })

  it('does not send a journal mutation while the account write state is locked', async () => {
    const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    drafts.hydrate(snapshot('challenge-a', 'server baseline', 1))
    drafts.setDraftText('challenge-a', DATE, 'private draft')
    account.context!.write_state = 'locked_for_import'

    await drafts.save('challenge-a', DATE)

    expect(sync.reconcileBeforeWrite).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({ status: 'blocked' })
  })

  it('refreshes auth after a 401 and never retries or exposes the draft before reconciliation', async () => {
    const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    save.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 401 }))
    vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
    drafts.hydrate(snapshot('challenge-a', 'server baseline', 1))
    drafts.setDraftText('challenge-a', DATE, 'private draft')

    await drafts.save('challenge-a', DATE)
    await drafts.save('challenge-a', DATE)

    expect(auth.status).toBe('guest')
    expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
    expect(Object.values(drafts.drafts)[0]).toMatchObject({
      text: 'private draft',
      status: 'quarantined',
      requiresReconciliation: true,
    })
    expect(save).toHaveBeenCalledOnce()
  })

  it('treats error, conflict, blocked, and unresolved command states as unsaved work', () => {
    drafts.hydrate(snapshot('challenge-a', 'server baseline', 1))
    const record = drafts.getDraft('challenge-a', DATE)
    expect(record).toBeDefined()
    expect(drafts.hasUnsavedDrafts()).toBe(false)

    record!.status = 'error'
    expect(drafts.hasUnsavedDrafts()).toBe(true)
    record!.status = 'conflict'
    expect(drafts.hasUnsavedDrafts()).toBe(true)
    record!.status = 'blocked'
    expect(drafts.hasUnsavedDrafts()).toBe(true)
    record!.status = 'saving'
    record!.pendingCommand = Object.freeze({
      revision: 0,
      ownerId: 42,
      authGeneration: auth.generation,
      dataEpoch: 4,
      request: Object.freeze({ command_id: 'uncertain', data_epoch: 4, base_version: 1, journal: 'server baseline' }),
    })
    expect(drafts.hasUnsavedDrafts()).toBe(true)

    record!.status = 'saved'
    record!.pendingCommand = null
    expect(drafts.hasUnsavedDrafts()).toBe(false)
  })

  it('reconciles a changed same-epoch version as a conflict without changing the local base', () => {
    drafts.hydrate(snapshot('challenge-a', 'server baseline', 1))
    drafts.setDraftText('challenge-a', DATE, 'private draft')
    auth.generation += 1

    drafts.hydrate(snapshot('challenge-a', 'updated on server', 2))

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
      text: 'private draft',
      journalVersion: 1,
      status: 'conflict',
      conflictSnapshot: snapshot('challenge-a', 'updated on server', 2),
    })
  })
})
