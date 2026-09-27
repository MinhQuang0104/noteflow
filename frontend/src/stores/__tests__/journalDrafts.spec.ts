import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as challengesApi from '../../api/challenges'
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

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
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

    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({
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
    expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({ status: 'quarantined' })
  })
})
