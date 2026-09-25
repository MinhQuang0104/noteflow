import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import * as accountApi from '../../api/account'
import * as challengesApi from '../../api/challenges'
import { useAccountStore } from '../../stores/account'
import { useAuthStore } from '../../stores/auth'
import TodayView from '../TodayView.vue'

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

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/today', component: TodayView },
      { path: '/challenges/:id', component: TodayView },
    ],
  })
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
})

test('shows the account-day challenge list with an entry point to the optional journal detail', async () => {
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [challenge] })
  const router = createTestRouter()
  await router.push('/today')

  const wrapper = mount(TodayView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()

  expect(wrapper.get('#today-challenges').text()).toContain('Đọc sách 30 phút')
  const journalLink = wrapper.get('[data-testid="today-journal-link"]')
  expect(journalLink.text()).toContain('Mở chi tiết và nhật ký')
  expect(journalLink.attributes('href')).toBe(`/challenges/${challenge.id}`)
  expect(wrapper.text()).toContain('2026-09-19')
})

test('keeps Today actionable when the private challenge read fails', async () => {
  vi.spyOn(challengesApi, 'getChallenges').mockRejectedValue(new Error('Network failure'))
  const router = createTestRouter()
  await router.push('/today')

  const wrapper = mount(TodayView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()

  expect(wrapper.get('#today-challenges-error').text()).toContain('Không thể tải danh sách challenge')
  expect(wrapper.get('#today-challenges-retry').text()).toContain('Thử lại')
})
