import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'

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
