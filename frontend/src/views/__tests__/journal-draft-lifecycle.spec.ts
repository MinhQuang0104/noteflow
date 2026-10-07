import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'

import * as authApi from '../../api/auth'
import * as challengesApi from '../../api/challenges'
import ChallengeJournalEditor from '../../components/ChallengeJournalEditor.vue'
import { useAccountStore } from '../../stores/account'
import { useAuthStore } from '../../stores/auth'
import { useJournalDraftsStore } from '../../stores/journalDrafts'
import { useSyncStore } from '../../stores/sync'

const challengeId = 'c1111111-2026-4444-9999-000000000001'
const otherChallengeId = 'c2222222-2026-4444-9999-000000000002'
const localDate = '2026-09-19'
const otherDate = '2026-09-20'

const emptyJournal: challengesApi.JournalSnapshot = {
  challenge_id: challengeId,
  local_date: localDate,
  journal: null,
  journal_version: 0,
}

let queryClient: QueryClient
let serverJournals: Map<string, challengesApi.JournalSnapshot>

function resourceKey(id: string, date: string): string {
  return `${id}:${date}`
}

function conflictError(
  id: string,
  date: string,
  text: string,
  version: number,
): challengesApi.ChallengeApiError<challengesApi.JournalProblemDetails> {
  return new challengesApi.ChallengeApiError<challengesApi.JournalProblemDetails>('Xung đột phiên bản.', 409, {
    message: 'Xung đột phiên bản.',
    code: 'version_conflict',
    resource_id: id,
    current_version: version,
    current_snapshot: {
      challenge_id: id,
      local_date: date,
      journal: text,
      journal_version: version,
    },
  })
}

async function mountEditor(id = challengeId, date = localDate) {
  const wrapper = mount(ChallengeJournalEditor, {
    props: { challengeId: id, localDate: date },
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
    },
  })

  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  serverJournals = new Map([[resourceKey(challengeId, localDate), { ...emptyJournal }]])
  vi.restoreAllMocks()

  const auth = useAuthStore()
  auth.status = 'authenticated'
  auth.generation = 1
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }

  const account = useAccountStore()
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: localDate,
    week: { start_date: '2026-09-14', end_date: '2026-09-20' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  }

  const sync = useSyncStore()
  sync.setQueryClient(queryClient)
  vi.spyOn(sync, 'reconcileBeforeWrite').mockResolvedValue({ allowed: true })
  vi.spyOn(sync, 'recordMutationAck').mockResolvedValue(true)

  vi.spyOn(challengesApi, 'getChallengeJournal').mockImplementation(async (id, date) => ({
    journal: {
      ...(serverJournals.get(resourceKey(id, date)) ?? {
        ...emptyJournal,
        challenge_id: id,
        local_date: date,
      }),
    },
  }))
})

test('keeps the journal lifecycle safe across uncertain retry, late ACK, reload, and route switch', async () => {
  const drafts = useJournalDraftsStore()
  const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
  save.mockImplementation(async (id, date, request) => {
    const key = resourceKey(id, date)

    if (save.mock.calls.length === 1) {
      const committed = {
        ...serverJournals.get(key)!,
        journal: request.journal,
        journal_version: 2,
      }
      serverJournals.set(key, committed)
      throw new TypeError('network timeout after server commit')
    }

    if (save.mock.calls.length === 2) {
      return {
        journal: { ...serverJournals.get(key)! },
        account_revision: 2,
        data_epoch: 1,
      }
    }

    const committed = {
      ...serverJournals.get(key)!,
      journal: request.journal,
      journal_version: 3,
    }
    serverJournals.set(key, committed)
    return {
      journal: committed,
      account_revision: 3,
      data_epoch: 1,
    }
  })

  const wrapper = await mountEditor()
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('')

  await wrapper.get('#journal-editor').setValue('first revision')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(wrapper.find('#journal-save-error').exists()).toBe(true)
  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    text: 'first revision',
    status: 'error',
    pendingCommand: { request: { journal: 'first revision', base_version: 0 } },
  })
  const originalRequest = save.mock.calls[0]

  await wrapper.get('#journal-editor').setValue('second revision')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(save.mock.calls[1]).toEqual(originalRequest)
  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    text: 'second revision',
    acknowledgedText: 'first revision',
    journalVersion: 2,
    status: 'dirty',
    pendingCommand: null,
  })

  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  const latestRequest = save.mock.calls[2]?.[2]
  expect(latestRequest).toMatchObject({
    data_epoch: 1,
    base_version: 2,
    journal: 'second revision',
  })
  expect(latestRequest?.command_id).not.toBe(originalRequest?.[2].command_id)
  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    text: 'second revision',
    acknowledgedText: 'second revision',
    journalVersion: 3,
    status: 'saved',
  })

  for (const [, , request] of save.mock.calls) {
    expect(request).not.toHaveProperty('completion')
    expect(request).not.toHaveProperty('is_done')
  }

  wrapper.unmount()
  queryClient.removeQueries({ queryKey: ['challenge-journal', challengeId, localDate] })

  const reloaded = await mountEditor()
  expect(challengesApi.getChallengeJournal).toHaveBeenCalledWith(challengeId, localDate)
  expect((reloaded.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('second revision')

  await reloaded.setProps({ challengeId: otherChallengeId, localDate: otherDate })
  await flushPromises()
  await reloaded.setProps({ challengeId, localDate })
  await flushPromises()
  expect((reloaded.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('second revision')
  reloaded.unmount()
})

test('keeps the conflict and draft across close/reopen, and does not cancel a pending choice or lose newer typing', async () => {
  const drafts = useJournalDraftsStore()
  const serverSnapshot: challengesApi.JournalSnapshot = {
    ...emptyJournal,
    journal: 'Bản lưu trên máy chủ',
    journal_version: 2,
  }
  let acknowledgeResolution!: (result: challengesApi.JournalMutationResult) => void
  const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    .mockRejectedValueOnce(conflictError(challengeId, localDate, serverSnapshot.journal!, 2))
    .mockImplementationOnce(() => new Promise(resolve => { acknowledgeResolution = resolve }))
  const wrapper = await mountEditor()

  await wrapper.get('#journal-editor').setValue('Bản nháp gốc trên thiết bị')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()
  await wrapper.get('#journal-conflict-open').trigger('click')
  expect(wrapper.get('#content-conflict-dialog').text()).toContain('Bản nháp gốc trên thiết bị')
  expect(wrapper.get('#content-conflict-dialog').text()).toContain('Bản lưu trên máy chủ')

  await wrapper.get('#content-conflict-close').trigger('click')
  await flushPromises()
  expect(wrapper.find('#content-conflict-dialog').attributes('open')).toBeUndefined()
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('Bản nháp gốc trên thiết bị')
  expect(drafts.getDraft(challengeId, localDate)?.conflictSnapshot?.journal).toBe('Bản lưu trên máy chủ')

  await wrapper.get('#journal-conflict-open').trigger('click')
  expect(wrapper.findAll('#content-conflict-dialog input:checked')).toHaveLength(0)
  await wrapper.get('#conflict-local').setValue()
  await wrapper.get('#content-conflict-confirm').trigger('click')
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    text: 'Bản nháp gốc trên thiết bị',
    status: 'saving',
    pendingCommand: { resolution: { choice: 'local', expectedServerVersion: 2, expectedClientRevision: 1 } },
  })

  await wrapper.get('#journal-editor').setValue('Nội dung gõ thêm trong lúc chờ')
  await wrapper.get('#content-conflict-close').trigger('click')
  expect(save).toHaveBeenCalledTimes(2)
  expect(drafts.getDraft(challengeId, localDate)?.pendingCommand?.request.journal).toBe('Bản nháp gốc trên thiết bị')

  await wrapper.get('#journal-conflict-open').trigger('click')
  expect((wrapper.get('#content-conflict-confirm').element as HTMLButtonElement).disabled).toBe(true)
  expect((wrapper.get('#content-conflict-close').element as HTMLButtonElement).disabled).toBe(false)
  acknowledgeResolution({
    journal: { ...serverSnapshot, journal: 'Bản nháp gốc trên thiết bị', journal_version: 3 },
    account_revision: 2,
    data_epoch: 1,
  })
  await flushPromises()

  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    text: 'Nội dung gõ thêm trong lúc chờ',
    acknowledgedText: 'Bản nháp gốc trên thiết bị',
    status: 'dirty',
    pendingCommand: null,
    conflictSnapshot: null,
  })
  expect(wrapper.find('#content-conflict-dialog').attributes('open')).toBeUndefined()
  wrapper.unmount()
})

test.each([false, true] as const)('does not write a late ACK for A into B journal cache when B is %s', async (dirtyB) => {
  const serverSnapshotA: challengesApi.JournalSnapshot = {
    ...emptyJournal,
    journal: 'Bản lưu trên máy chủ A',
    journal_version: 2,
  }
  const serverSnapshotB: challengesApi.JournalSnapshot = {
    challenge_id: otherChallengeId,
    local_date: otherDate,
    journal: 'Nội dung B trên máy chủ',
    journal_version: 4,
  }
  serverJournals.set(resourceKey(otherChallengeId, otherDate), serverSnapshotB)
  const cacheKeyB = ['challenge-journal', otherChallengeId, otherDate] as const
  queryClient.setQueryData<challengesApi.JournalReadResult>(cacheKeyB, { journal: serverSnapshotB })

  let acknowledgeResolution!: (result: challengesApi.JournalMutationResult) => void
  const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    .mockRejectedValueOnce(conflictError(challengeId, localDate, serverSnapshotA.journal!, 2))
    .mockImplementationOnce(() => new Promise(resolve => { acknowledgeResolution = resolve }))

  const wrapper = await mountEditor()
  await wrapper.get('#journal-editor').setValue('Bản nháp A')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()
  await wrapper.get('#journal-conflict-open').trigger('click')
  await wrapper.get('#conflict-local').setValue()
  const confirm = wrapper.get('#content-conflict-confirm').trigger('click')
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))

  await wrapper.setProps({ challengeId: otherChallengeId, localDate: otherDate })
  await flushPromises()
  if (dirtyB) {
    await wrapper.get('#journal-editor').setValue('Bản nháp B chưa lưu')
  }
  const cacheBeforeAck = queryClient.getQueryData(cacheKeyB)

  acknowledgeResolution({
    journal: { ...serverSnapshotA, journal: 'Bản nháp A đã ACK', journal_version: 3 },
    account_revision: 2,
    data_epoch: 1,
  })
  await confirm
  await flushPromises()

  expect(queryClient.getQueryData(cacheKeyB)).toEqual(cacheBeforeAck)
  wrapper.unmount()
})

test('requires a new choice when another device changes the server snapshot again', async () => {
  const drafts = useJournalDraftsStore()
  const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    .mockRejectedValueOnce(conflictError(challengeId, localDate, 'Máy chủ phiên bản hai', 2))
    .mockRejectedValueOnce(conflictError(challengeId, localDate, 'Máy chủ phiên bản ba', 3))
  const wrapper = await mountEditor()

  await wrapper.get('#journal-editor').setValue('Bản nháp cục bộ')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()
  await wrapper.get('#journal-conflict-open').trigger('click')
  await wrapper.get('#conflict-server').setValue()
  await wrapper.get('#content-conflict-confirm').trigger('click')
  await flushPromises()

  expect(save).toHaveBeenCalledTimes(2)
  expect(drafts.getDraft(challengeId, localDate)?.conflictSnapshot).toMatchObject({
    journal: 'Máy chủ phiên bản ba',
    journal_version: 3,
  })
  expect(wrapper.get('#content-conflict-dialog').text()).toContain('Máy chủ phiên bản ba')
  expect(wrapper.findAll('#content-conflict-dialog input:checked')).toHaveLength(0)
  expect((wrapper.get('#content-conflict-confirm').element as HTMLButtonElement).disabled).toBe(true)
  wrapper.unmount()
})

test('shows a resolution error and retries the same pending command after the dialog is reopened', async () => {
  const drafts = useJournalDraftsStore()
  const serverSnapshot: challengesApi.JournalSnapshot = {
    ...emptyJournal,
    journal: 'Bản lưu trên máy chủ',
    journal_version: 2,
  }
  const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
    .mockRejectedValueOnce(conflictError(challengeId, localDate, serverSnapshot.journal!, 2))
    .mockRejectedValueOnce(new TypeError('network timeout'))
    .mockResolvedValueOnce({
      journal: { ...serverSnapshot, journal: 'Bản nháp cục bộ', journal_version: 3 },
      account_revision: 2,
      data_epoch: 1,
    })
  const wrapper = await mountEditor()

  await wrapper.get('#journal-editor').setValue('Bản nháp cục bộ')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()
  await wrapper.get('#journal-conflict-open').trigger('click')
  await wrapper.get('#conflict-local').setValue()
  await wrapper.get('#content-conflict-confirm').trigger('click')
  await flushPromises()

  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    status: 'error',
    pendingCommand: { resolution: { choice: 'local', expectedServerVersion: 2, expectedClientRevision: 1 } },
  })
  expect(wrapper.get('#content-conflict-dialog [role="alert"]').text()).toContain('Chưa xác định được kết quả lưu')
  const pendingRequest = save.mock.calls[1]?.[2]

  await wrapper.get('#journal-editor').setValue('Bản nháp cục bộ có gõ thêm')
  await wrapper.get('#content-conflict-close').trigger('click')
  await wrapper.get('#journal-conflict-open').trigger('click')
  expect(wrapper.findAll('#content-conflict-dialog input:checked')).toHaveLength(0)
  await wrapper.get('#conflict-local').setValue()
  await wrapper.get('#content-conflict-confirm').trigger('click')
  await flushPromises()

  expect(save).toHaveBeenCalledTimes(3)
  expect(save.mock.calls[2]?.[2]).toEqual(pendingRequest)
  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    text: 'Bản nháp cục bộ có gõ thêm',
    status: 'dirty',
    acknowledgedText: 'Bản nháp cục bộ',
    pendingCommand: null,
    conflictSnapshot: null,
  })
  wrapper.unmount()
})

test('shows epoch rebase action when a dirty draft is remounted after the account epoch changes', async () => {
  const drafts = useJournalDraftsStore()
  const wrapper = await mountEditor()
  await wrapper.get('#journal-editor').setValue('Bản nháp epoch cũ')
  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({ dataEpoch: 1, text: 'Bản nháp epoch cũ' })
  wrapper.unmount()

  queryClient.removeQueries({ queryKey: ['challenge-journal', challengeId, localDate] })
  const account = useAccountStore()
  account.context = { ...account.context!, account_revision: 2, data_epoch: 2 }

  const remounted = await mountEditor()
  expect((remounted.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('Bản nháp epoch cũ')
  expect(remounted.find('#journal-epoch-alert').exists()).toBe(true)
  expect(remounted.find('#journal-epoch-rebase-btn').exists()).toBe(true)

  await remounted.get('#journal-epoch-rebase-btn').trigger('click')
  await flushPromises()

  expect(remounted.find('#journal-epoch-alert').exists()).toBe(false)
  expect(drafts.getDraft(challengeId, localDate)).toMatchObject({
    dataEpoch: 2,
    text: 'Bản nháp epoch cũ',
    acknowledgedText: '',
    status: 'dirty',
  })
  remounted.unmount()
})

test.each(['resource switch', 'session expiry', 'logout'] as const)(
  'closes conflict UI without showing stale private text after %s',
  async (transition) => {
    const localText = 'Bản nháp riêng của phiên cũ'
    const serverText = 'Bản máy chủ riêng của phiên cũ'
    vi.spyOn(challengesApi, 'saveChallengeJournal')
      .mockRejectedValueOnce(conflictError(challengeId, localDate, serverText, 2))
    const wrapper = await mountEditor()

    await wrapper.get('#journal-editor').setValue(localText)
    await wrapper.get('#journal-form').trigger('submit.prevent')
    await flushPromises()
    await wrapper.get('#journal-conflict-open').trigger('click')
    expect(wrapper.get('#content-conflict-dialog').text()).toContain(localText)

    if (transition === 'resource switch') {
      await wrapper.setProps({ challengeId: otherChallengeId, localDate: otherDate })
    } else if (transition === 'session expiry') {
      vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
      await useAuthStore().refreshSession()
    } else {
      vi.spyOn(authApi, 'logout').mockResolvedValue()
      await useAuthStore().logOut()
    }
    await flushPromises()

    const dialog = wrapper.find('#content-conflict-dialog')
    expect(dialog.exists() ? dialog.attributes('open') : undefined).toBeUndefined()
    expect(wrapper.text()).not.toContain(localText)
    expect(wrapper.text()).not.toContain(serverText)
    wrapper.unmount()
  },
)
