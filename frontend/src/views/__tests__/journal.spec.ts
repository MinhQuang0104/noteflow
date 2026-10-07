import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import * as accountApi from '../../api/account'
import * as challengesApi from '../../api/challenges'
import ChallengeJournalEditor from '../../components/ChallengeJournalEditor.vue'
import { useAccountStore } from '../../stores/account'
import { useAuthStore } from '../../stores/auth'
import { useJournalDraftsStore } from '../../stores/journalDrafts'
import { useSyncStore } from '../../stores/sync'
import ChallengesView from '../ChallengesView.vue'

let queryClient: QueryClient

const challenge = {
  id: 'c1111111-2026-4444-9999-000000000001',
  name: 'Đọc sách 30 phút',
  description: 'Mỗi ngày sau khi thức dậy',
  start_date: '2026-09-19',
  target_days: 5,
  row_version: 1,
  created_at: '2026-09-19T10:00:00Z',
  updated_at: '2026-09-19T10:00:00Z',
}

const emptyJournal = {
  challenge_id: challenge.id,
  local_date: '2026-09-19',
  journal: null,
  journal_version: 0,
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/challenges', component: ChallengesView },
      { path: '/challenges/:id', component: ChallengesView },
    ],
  })
}

async function mountChallengeDetail() {
  const router = createTestRouter()
  await router.push('/challenges')

  const wrapper = mount(ChallengesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()
  await wrapper.get('li a').trigger('click')
  await flushPromises()
  return wrapper
}

async function mountJournalEditor(challengeId = challenge.id, localDate = '2026-09-19') {
  const wrapper = mount(ChallengeJournalEditor, {
    props: { challengeId, localDate },
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
      queries: {
        retry: false,
      },
    },
  })
  vi.restoreAllMocks()

  const auth = useAuthStore()
  auth.status = 'authenticated'
  auth.generation = 1
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }

  vi.spyOn(accountApi, 'getAccountContext').mockResolvedValue({
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-19',
    week: { start_date: '2026-09-14', end_date: '2026-09-20' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  })

  const sync = useSyncStore()
  sync.setQueryClient(queryClient)

  const account = useAccountStore()
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-19',
    week: { start_date: '2026-09-14', end_date: '2026-09-20' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  }
  account.status = 'ready'

  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [challenge] })
  vi.spyOn(challengesApi, 'getChallengeJournal').mockImplementation(async (challengeId, localDate) => ({
    journal: { ...emptyJournal, challenge_id: challengeId, local_date: localDate },
  }))
})

test('renders an optional account-day journal editor for the selected challenge', async () => {
  const getJournalSpy = vi.mocked(challengesApi.getChallengeJournal)

  const wrapper = await mountChallengeDetail()

  expect(getJournalSpy).toHaveBeenCalledWith(challenge.id, '2026-09-19')
  expect(wrapper.get('#challenge-journal').text()).toContain('Nhật ký (tùy chọn)')
  expect(wrapper.get('#journal-editor').attributes('aria-label')).toContain('2026-09-19')
  expect(wrapper.get('#journal-save-btn').text()).toContain('Lưu nhật ký')
  expect(wrapper.get('#journal-empty-state').text()).toContain('Chưa có nhật ký')
})

test('loads existing journal text and saves it with the typed journal version only', async () => {
  const existingJournal = {
    ...emptyJournal,
    journal: 'Tập trung tốt hơn sau khi đi bộ.',
    journal_version: 4,
  }
  vi.mocked(challengesApi.getChallengeJournal).mockResolvedValue({ journal: existingJournal })
  const saveSpy = vi.spyOn(challengesApi, 'saveChallengeJournal').mockResolvedValue({
    journal: { ...existingJournal, journal: 'Bản cập nhật trong ngày.', journal_version: 5 },
    account_revision: 2,
    data_epoch: 1,
  })

  const wrapper = await mountChallengeDetail()

  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe(existingJournal.journal)
  await wrapper.get('#journal-editor').setValue('Bản cập nhật trong ngày.')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(saveSpy).toHaveBeenCalledWith(
    challenge.id,
    '2026-09-19',
    expect.objectContaining({
      command_id: expect.any(String),
      data_epoch: 1,
      base_version: 4,
      journal: 'Bản cập nhật trong ngày.',
    }),
  )
  const payload = saveSpy.mock.calls[0]?.[2]
  expect(payload).not.toHaveProperty('completion')
  expect(payload).not.toHaveProperty('is_done')
  expect(wrapper.get('#journal-save-status').text()).toContain('Đã lưu nhật ký')
})

test('rejects whitespace-only journal text without sending a mutation', async () => {
  const saveSpy = vi.spyOn(challengesApi, 'saveChallengeJournal')
  const wrapper = await mountChallengeDetail()

  await wrapper.get('#journal-editor').setValue(' \n  ')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(wrapper.get('#journal-error').text()).toContain('không được để trống')
  expect(saveSpy).not.toHaveBeenCalled()
  expect(wrapper.find('#journal-save-status').text()).not.toContain('Đã lưu nhật ký')
})

test('preserves both journal versions until the owner explicitly confirms the server choice', async () => {
  const serverSnapshot = {
    ...emptyJournal,
    journal: 'Nội dung đã lưu trên thiết bị khác.',
    journal_version: 2,
  }
  const saveSpy = vi.spyOn(challengesApi, 'saveChallengeJournal')
    .mockRejectedValueOnce(new challengesApi.ChallengeApiError(
      'Xung đột phiên bản.',
      409,
      {
        message: 'Xung đột phiên bản.',
        code: 'version_conflict',
        resource_id: challenge.id,
        current_version: 2,
        current_snapshot: serverSnapshot,
      },
    ))
    .mockResolvedValueOnce({ journal: serverSnapshot, account_revision: 2, data_epoch: 1 })
  const wrapper = await mountChallengeDetail()

  await wrapper.get('#journal-editor').setValue('Bản nháp chưa gửi của tôi.')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(saveSpy).toHaveBeenCalledTimes(1)
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('Bản nháp chưa gửi của tôi.')
  expect(wrapper.get('#journal-conflict-alert').text()).not.toContain('Nội dung đã lưu trên thiết bị khác.')
  expect(wrapper.get('#journal-conflict-alert').text()).toContain('Bản đang nhập vẫn được giữ nguyên')
  expect(wrapper.find('#journal-save-status').exists()).toBe(false)
  expect(wrapper.get('#journal-save-btn').attributes('disabled')).toBeDefined()

  await wrapper.get('#journal-conflict-open').trigger('click')
  const dialog = wrapper.get('#content-conflict-dialog')
  expect(dialog.text()).toContain('Bản nháp chưa gửi của tôi.')
  expect(dialog.text()).toContain('Nội dung đã lưu trên thiết bị khác.')
  expect(wrapper.findAll('#content-conflict-dialog input:checked')).toHaveLength(0)

  await wrapper.get('#conflict-server').setValue()
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('Bản nháp chưa gửi của tôi.')
  await wrapper.get('#content-conflict-confirm').trigger('click')
  await flushPromises()

  expect(saveSpy).toHaveBeenCalledTimes(2)
  expect(saveSpy.mock.calls[1]?.[2]).toMatchObject({
    base_version: 2,
    journal: 'Nội dung đã lưu trên thiết bị khác.',
  })
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('Nội dung đã lưu trên thiết bị khác.')
  expect(wrapper.find('#journal-conflict-alert').exists()).toBe(false)
  expect(wrapper.find('#content-conflict-dialog').attributes('open')).toBeUndefined()
})

test('keeps the editor editable while saving and does not mark an older ACK as saved', async () => {
  let resolveSave!: (result: challengesApi.JournalMutationResult) => void
  const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
  save
    .mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    .mockResolvedValueOnce({
      journal: { ...emptyJournal, journal: 'revision two', journal_version: 2 },
      account_revision: 3,
      data_epoch: 1,
    })
  const wrapper = await mountJournalEditor()

  await wrapper.get('#journal-editor').setValue('revision one')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())

  expect(wrapper.get('#journal-editor').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('#journal-save-status').text()).toContain('Đang lưu')

  await wrapper.get('#journal-editor').setValue('revision two')
  resolveSave({
    journal: { ...emptyJournal, journal: 'revision one', journal_version: 1 },
    account_revision: 2,
    data_epoch: 1,
  })
  await flushPromises()

  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('revision two')
  expect(wrapper.get('#journal-save-status').text()).toContain('Chưa lưu thay đổi')
  expect(wrapper.get('#journal-save-status').text()).not.toContain('Đã lưu nhật ký')

  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()
  expect(save).toHaveBeenCalledTimes(2)
  expect(wrapper.get('#journal-save-status').text()).toContain('Đã lưu nhật ký')
})

test('retains resource drafts across challenge changes and editor remounts', async () => {
  const wrapper = await mountJournalEditor()
  await wrapper.get('#journal-editor').setValue('draft for A')

  await wrapper.setProps({ challengeId: 'challenge-b', localDate: '2026-09-20' })
  await flushPromises()
  await wrapper.get('#journal-editor').setValue('draft for B')

  await wrapper.setProps({ challengeId: challenge.id, localDate: '2026-09-19' })
  await flushPromises()
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('draft for A')
  wrapper.unmount()

  const remounted = await mountJournalEditor()
  expect((remounted.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('draft for A')
  remounted.unmount()
})

test('shows a stored draft while the remounted editor is still loading its server snapshot', async () => {
  const drafts = useJournalDraftsStore()
  drafts.hydrate(emptyJournal)
  drafts.setDraftText(challenge.id, '2026-09-19', 'draft survives pending GET')
  vi.mocked(challengesApi.getChallengeJournal).mockReturnValue(new Promise(() => undefined))

  const wrapper = await mountJournalEditor()

  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('draft survives pending GET')
  wrapper.unmount()
})

test('does not let a journal refetch replace dirty text or its acknowledged base version', async () => {
  vi.spyOn(challengesApi, 'saveChallengeJournal').mockResolvedValue({
    journal: { ...emptyJournal, journal: 'local draft', journal_version: 1 },
    account_revision: 2,
    data_epoch: 1,
  })
  const wrapper = await mountJournalEditor()
  await wrapper.get('#journal-editor').setValue('local draft')

  queryClient.setQueryData(['challenge-journal', challenge.id, '2026-09-19'], {
    journal: { ...emptyJournal, journal: 'new server snapshot', journal_version: 8 },
  })
  await flushPromises()

  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('local draft')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(challengesApi.saveChallengeJournal).toHaveBeenCalledWith(
    challenge.id,
    '2026-09-19',
    expect.objectContaining({ base_version: 0, journal: 'local draft' }),
  )
})

test('an ACK for challenge A does not change the active challenge B draft', async () => {
  let resolveSave!: (result: challengesApi.JournalMutationResult) => void
  vi.spyOn(challengesApi, 'saveChallengeJournal').mockReturnValue(new Promise((resolve) => {
    resolveSave = resolve
  }))
  const wrapper = await mountJournalEditor()

  await wrapper.get('#journal-editor').setValue('draft A')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await vi.waitFor(() => expect(challengesApi.saveChallengeJournal).toHaveBeenCalledOnce())
  await wrapper.setProps({ challengeId: 'challenge-b' })
  await flushPromises()
  await wrapper.get('#journal-editor').setValue('draft B')

  resolveSave({
    journal: { ...emptyJournal, journal: 'draft A', journal_version: 1 },
    account_revision: 2,
    data_epoch: 1,
  })
  await flushPromises()

  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('draft B')
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
})

test('keeps a network-failed draft and offers an explicit retry of the same command', async () => {
  const save = vi.spyOn(challengesApi, 'saveChallengeJournal')
  save
    .mockRejectedValueOnce(new TypeError('network timeout'))
    .mockResolvedValueOnce({
      journal: { ...emptyJournal, journal: 'retry me', journal_version: 1 },
      account_revision: 2,
      data_epoch: 1,
    })
  const wrapper = await mountJournalEditor()

  await wrapper.get('#journal-editor').setValue('retry me')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('retry me')
  expect(wrapper.get('#journal-save-error').text()).toContain('Chưa xác định được kết quả lưu')
  expect(wrapper.get('#journal-save-btn').text()).toContain('Thử lại')

  const firstRequest = save.mock.calls[0]
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(save).toHaveBeenCalledTimes(2)
  expect(save.mock.calls[1]).toEqual(firstRequest)
  expect(wrapper.get('[role="status"]').text()).toContain('Đã lưu nhật ký')
})

test('keeps journal Saved when challenge query convergence fails after a committed ACK', async () => {
  const sync = useSyncStore()
  let rejectInvalidation!: (error: Error) => void
  vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise((_, reject) => {
    rejectInvalidation = reject
  }))
  vi.spyOn(challengesApi, 'saveChallengeJournal').mockResolvedValue({
    journal: { ...emptyJournal, journal: 'committed journal', journal_version: 1 },
    account_revision: 2,
    data_epoch: 1,
  })
  const wrapper = await mountJournalEditor()

  await wrapper.get('#journal-editor').setValue('committed journal')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(wrapper.get('[role="status"]').text()).toContain('Đã lưu nhật ký')
  rejectInvalidation(new Error('challenge refetch failed'))
  await vi.waitFor(() => expect(sync.syncStatus).toBe('error'))
  expect(sync.syncStatus).toBe('error')
  expect(sync.syncError).toContain('đồng bộ danh sách challenge')

  await wrapper.get('#journal-editor').setValue('new edit')
  expect(wrapper.get('[role="status"]').text()).toContain('Chưa lưu thay đổi')
  expect(wrapper.get('[role="status"]').text()).not.toContain('Đã lưu nhật ký')
})
