import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import * as accountApi from '../../api/account'
import * as challengesApi from '../../api/challenges'
import { useAccountStore } from '../../stores/account'
import { useAuthStore } from '../../stores/auth'
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
  await wrapper.get('li').trigger('click')
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
  vi.spyOn(challengesApi, 'getChallengeJournal').mockResolvedValue({ journal: emptyJournal })
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
})

test('preserves a dirty draft after a stale journal conflict and exposes the saved server snapshot', async () => {
  const saveSpy = vi.spyOn(challengesApi, 'saveChallengeJournal').mockRejectedValue(
    new challengesApi.ChallengeApiError(
      'Xung đột phiên bản.',
      409,
      {
        message: 'Xung đột phiên bản.',
        code: 'version_conflict',
        resource_id: challenge.id,
        current_version: 2,
        current_snapshot: {
          ...emptyJournal,
          journal: 'Nội dung đã lưu trên thiết bị khác.',
          journal_version: 2,
        },
      },
    ),
  )
  const wrapper = await mountChallengeDetail()

  await wrapper.get('#journal-editor').setValue('Bản nháp chưa gửi của tôi.')
  await wrapper.get('#journal-form').trigger('submit.prevent')
  await flushPromises()

  expect(saveSpy).toHaveBeenCalledTimes(1)
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('Bản nháp chưa gửi của tôi.')
  expect(wrapper.get('#journal-conflict-alert').text()).toContain('Nội dung đã lưu trên thiết bị khác.')
  expect(wrapper.get('#journal-conflict-alert').text()).toContain('Bản đang nhập vẫn được giữ nguyên')
  expect(wrapper.get('#journal-save-btn').attributes('disabled')).toBeDefined()

  await wrapper.get('#journal-use-server-btn').trigger('click')
  expect((wrapper.get('#journal-editor').element as HTMLTextAreaElement).value).toBe('Nội dung đã lưu trên thiết bị khác.')
  expect(wrapper.find('#journal-conflict-alert').exists()).toBe(false)
})
