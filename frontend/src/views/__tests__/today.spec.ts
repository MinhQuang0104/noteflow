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

// List rows carry the shared week projection and today state (Story 2.2).
const listItem = (
  challengeData: challengesApi.Challenge,
  overrides?: Partial<challengesApi.ChallengeListItem>,
): challengesApi.ChallengeListItem => ({
  ...challengeData,
  week_progress: { start_date: '2026-09-14', end_date: '2026-09-20', done_days: 0, target_days: challengeData.target_days },
  today: { local_date: '2026-09-19', is_done: false, completion_version: 0 },
  ...overrides,
})

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
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [challenge].map((c) => listItem(c)) })
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

test('renders name, Done/target this week and today state directly from projection fields without local derivation', async () => {
  const item1 = listItem(challenge, {
    week_progress: { start_date: '2026-09-14', end_date: '2026-09-20', done_days: 2, target_days: 5 },
    today: { local_date: '2026-09-19', is_done: false, completion_version: 0 },
  })
  const item2: challengesApi.ChallengeListItem = {
    id: 'c2222222-2026-4444-9999-000000000002',
    name: 'Tập thể dục 20 phút',
    description: null,
    start_date: '2026-09-14',
    target_days: 4,
    row_version: 1,
    created_at: '2026-09-14T08:00:00Z',
    updated_at: '2026-09-14T08:00:00Z',
    week_progress: { start_date: '2026-09-14', end_date: '2026-09-20', done_days: 4, target_days: 4 },
    today: { local_date: '2026-09-19', is_done: true, completion_version: 1 },
  }

  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [item1, item2] })
  const router = createTestRouter()
  await router.push('/today')

  const wrapper = mount(TodayView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })
  await flushPromises()

  const row1 = wrapper.get(`[data-testid="today-challenge-${item1.id}"]`)
  expect(row1.get('[data-testid="challenge-name"]').text()).toBe('Đọc sách 30 phút')
  expect(row1.get('[data-testid="challenge-progress"]').text()).toContain('2/5 ngày tuần này')
  expect(row1.get('[data-testid="challenge-today-state"]').text()).toBe('Chưa xong')

  const row2 = wrapper.get(`[data-testid="today-challenge-${item2.id}"]`)
  expect(row2.get('[data-testid="challenge-name"]').text()).toBe('Tập thể dục 20 phút')
  expect(row2.get('[data-testid="challenge-progress"]').text()).toContain('4/4 ngày tuần này')
  expect(row2.get('[data-testid="challenge-today-state"]').text()).toBe('Đã xong')
})

test('one tap sends a single Done command for account-today without journal', async () => {
  const item = listItem(challenge)
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [item] })

  const doneResult: challengesApi.CompletionMutationResult = {
    completion: {
      challenge_id: challenge.id,
      local_date: '2026-09-19',
      is_done: true,
      completion_version: 1,
    },
    week_progress: {
      start_date: '2026-09-14',
      end_date: '2026-09-20',
      done_days: 1,
      target_days: 5,
    },
    account_revision: 2,
    data_epoch: 1,
  }

  const markDoneSpy = vi.spyOn(challengesApi, 'markChallengeDone').mockResolvedValue(doneResult)

  const router = createTestRouter()
  await router.push('/today')

  const wrapper = mount(TodayView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })
  await flushPromises()

  const doneButton = wrapper.get('[data-testid="challenge-done-button"]')
  expect(doneButton.text()).toBe('Done')

  await doneButton.trigger('click')
  await flushPromises()

  expect(markDoneSpy).toHaveBeenCalledTimes(1)
  expect(markDoneSpy).toHaveBeenCalledWith(
    challenge.id,
    '2026-09-19',
    expect.objectContaining({
      command_id: expect.any(String),
      data_epoch: 1,
      is_done: true,
    }),
  )

  const callArgs = markDoneSpy.mock.calls[0]
  expect(callArgs).toBeDefined()
  const payload = callArgs![2]
  expect(payload).not.toHaveProperty('journal')
  expect(payload).not.toHaveProperty('journal_version')
})

test('saved appears only after server acknowledgement', async () => {
  const item = listItem(challenge)
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [item] })

  let resolveDone!: (value: challengesApi.CompletionMutationResult) => void
  const donePromise = new Promise<challengesApi.CompletionMutationResult>((resolve) => {
    resolveDone = resolve
  })
  vi.spyOn(challengesApi, 'markChallengeDone').mockReturnValue(donePromise)

  const router = createTestRouter()
  await router.push('/today')

  const wrapper = mount(TodayView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })
  await flushPromises()

  const doneButton = wrapper.get('[data-testid="challenge-done-button"]')
  await doneButton.trigger('click')

  // In-flight saving state: not yet saved
  expect(wrapper.find('[data-testid="challenge-saving-status"]').exists()).toBe(true)
  expect(wrapper.find('[data-testid="challenge-saved-status"]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="challenge-today-state"]').text()).toBe('Chưa xong')

  // Fulfill server acknowledgement
  resolveDone({
    completion: {
      challenge_id: challenge.id,
      local_date: '2026-09-19',
      is_done: true,
      completion_version: 1,
    },
    week_progress: {
      start_date: '2026-09-14',
      end_date: '2026-09-20',
      done_days: 1,
      target_days: 5,
    },
    account_revision: 2,
    data_epoch: 1,
  })

  await flushPromises()

  // Saved appears now
  expect(wrapper.find('[data-testid="challenge-saved-status"]').exists()).toBe(true)
  expect(wrapper.get('[data-testid="challenge-saved-status"]').text()).toBe('Đã lưu')
  expect(wrapper.get('[data-testid="challenge-today-state"]').text()).toBe('Đã xong')
  expect(wrapper.get('[data-testid="challenge-progress"]').text()).toContain('1/5 ngày tuần này')
})

test('a failed request keeps previous state and offers retry', async () => {
  const item = listItem(challenge, {
    week_progress: { start_date: '2026-09-14', end_date: '2026-09-20', done_days: 0, target_days: 5 },
    today: { local_date: '2026-09-19', is_done: false, completion_version: 0 },
  })
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [item] })

  const markDoneSpy = vi.spyOn(challengesApi, 'markChallengeDone').mockRejectedValueOnce(
    new Error('Mất kết nối máy chủ.'),
  )

  const router = createTestRouter()
  await router.push('/today')

  const wrapper = mount(TodayView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })
  await flushPromises()

  await wrapper.get('[data-testid="challenge-done-button"]').trigger('click')
  await flushPromises()

  // State preserved without reporting saved
  expect(wrapper.find('[data-testid="challenge-saved-status"]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="challenge-today-state"]').text()).toBe('Chưa xong')
  expect(wrapper.get('[data-testid="challenge-progress"]').text()).toContain('0/5 ngày tuần này')
  expect(wrapper.get('[data-testid="challenge-error-status"]').text()).toBe('Mất kết nối máy chủ.')

  // Retry is offered
  const retryBtn = wrapper.get('[data-testid="challenge-retry-button"]')
  expect(retryBtn.text()).toBe('Thử lại')

  // On retry, request succeeds
  markDoneSpy.mockResolvedValueOnce({
    completion: {
      challenge_id: challenge.id,
      local_date: '2026-09-19',
      is_done: true,
      completion_version: 1,
    },
    week_progress: {
      start_date: '2026-09-14',
      end_date: '2026-09-20',
      done_days: 1,
      target_days: 5,
    },
    account_revision: 2,
    data_epoch: 1,
  })

  await retryBtn.trigger('click')
  await flushPromises()

  expect(markDoneSpy).toHaveBeenCalledTimes(2)
  expect(wrapper.find('[data-testid="challenge-saved-status"]').exists()).toBe(true)
  expect(wrapper.get('[data-testid="challenge-today-state"]').text()).toBe('Đã xong')
  expect(wrapper.get('[data-testid="challenge-progress"]').text()).toContain('1/5 ngày tuần này')
})

test('an already-done day shows Done without a second request', async () => {
  const item = listItem(challenge, {
    week_progress: { start_date: '2026-09-14', end_date: '2026-09-20', done_days: 3, target_days: 5 },
    today: { local_date: '2026-09-19', is_done: true, completion_version: 1 },
  })
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [item] })
  const markDoneSpy = vi.spyOn(challengesApi, 'markChallengeDone')

  const router = createTestRouter()
  await router.push('/today')

  const wrapper = mount(TodayView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })
  await flushPromises()

  // Shows Done directly from projection
  expect(wrapper.get('[data-testid="challenge-today-state"]').text()).toBe('Đã xong')
  expect(wrapper.get('[data-testid="challenge-progress"]').text()).toContain('3/5 ngày tuần này')

  // No API call made
  expect(markDoneSpy).not.toHaveBeenCalled()

  // Done button is disabled and clicking it does not trigger any call
  const doneButton = wrapper.get('[data-testid="challenge-done-button"]')
  expect(doneButton.attributes()).toHaveProperty('disabled')
  await doneButton.trigger('click')
  await flushPromises()

  expect(markDoneSpy).not.toHaveBeenCalled()
})
