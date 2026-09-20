import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import * as challengesApi from '../../api/challenges'
import { useAccountStore } from '../../stores/account'
import ChallengesView from '../ChallengesView.vue'

let queryClient: QueryClient

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

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/challenges', component: ChallengesView },
      { path: '/challenges/:id', component: ChallengesView },
    ],
  })
}

test('renders challenges list and empty state when none exist', async () => {
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [] })
  const router = createTestRouter()
  await router.push('/challenges')

  const wrapper = mount(ChallengesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()

  expect(wrapper.text()).toContain('Chưa có challenge nào. Hãy tạo challenge đầu tiên!')
  expect(wrapper.text()).toContain('0 challenge')
})

test('AC1 — create form captures account-today and does not have weekday or start-date picker', async () => {
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [] })
  const router = createTestRouter()
  await router.push('/challenges')

  const wrapper = mount(ChallengesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()

  // Click "+ Tạo challenge"
  await wrapper.get('#create-challenge-btn').trigger('click')

  expect(wrapper.text()).toContain('Tạo challenge mới')
  // Verify account-today is displayed
  expect(wrapper.get('#create-start-date-display').text()).toContain('2026-09-19')

  // Invariant verification: NO start-date picker input, NO weekday picker
  expect(wrapper.find('input[name="start_date"]').exists()).toBe(false)
  expect(wrapper.find('input[type="date"]').exists()).toBe(false)
  expect(wrapper.find('select[name="weekday"]').exists()).toBe(false)
  expect(wrapper.find('input[name="weekday"]').exists()).toBe(false)
})

test('AC2 — create form rejects invalid target days and retains valid input', async () => {
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [] })
  const createSpy = vi.spyOn(challengesApi, 'createChallenge')
  const router = createTestRouter()
  await router.push('/challenges')

  const wrapper = mount(ChallengesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()
  await wrapper.get('#create-challenge-btn').trigger('click')

  // Set valid name but invalid target_days (> 7)
  await wrapper.get('#create-name').setValue('Chạy bộ 10km')
  await wrapper.get('#create-target').setValue(9)

  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  // Form should display target error
  expect(wrapper.find('#create-target-error').exists()).toBe(true)
  expect(wrapper.get('#create-target-error').text()).toBe('Mục tiêu số ngày phải là số nguyên từ 1 đến 7.')

  // Input retained
  expect((wrapper.get('#create-name').element as HTMLInputElement).value).toBe('Chạy bộ 10km')

  // Server API was not called
  expect(createSpy).not.toHaveBeenCalled()
})

test('AC1 & AC3 — creates valid challenge and allows editing name/description while preserving start_date and target', async () => {
  const mockChallenge = {
    id: 'c1111111-2026-4444-9999-000000000001',
    name: 'Uống đủ 2L nước',
    description: 'Nước lọc mỗi ngày',
    start_date: '2026-09-19',
    target_days: 7,
    row_version: 1,
    created_at: '2026-09-19T10:00:00Z',
    updated_at: '2026-09-19T10:00:00Z',
  }

  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [mockChallenge] })
  const updateSpy = vi.spyOn(challengesApi, 'updateChallengeMetadata').mockResolvedValue({
    challenge: {
      ...mockChallenge,
      name: 'Uống 2.5L nước',
      description: 'Nước lọc và nước ấm',
      row_version: 2,
    },
    account_revision: 2,
    data_epoch: 1,
  })

  const router = createTestRouter()
  await router.push('/challenges')

  const wrapper = mount(ChallengesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()

  // Select challenge
  await wrapper.get('li').trigger('click')
  await flushPromises()

  // Detail view check
  expect(wrapper.get('#challenge-detail-name').text()).toBe('Uống đủ 2L nước')
  expect(wrapper.get('#challenge-detail-target').text()).toContain('7 ngày / tuần')
  expect(wrapper.get('#challenge-detail-start-date').text()).toBe('2026-09-19')

  // Click edit
  await wrapper.get('#edit-challenge-btn').trigger('click')

  // Edit form: start_date and target_days are NOT inputs
  expect(wrapper.find('input[name="start_date"]').exists()).toBe(false)
  expect(wrapper.find('input[name="target_days"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('7 ngày/tuần')
  expect(wrapper.text()).toContain('2026-09-19')

  // Edit name and description
  await wrapper.get('#edit-name').setValue('Uống 2.5L nước')
  await wrapper.get('#edit-description').setValue('Nước lọc và nước ấm')

  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  // Verified update API call only sends name and description, not start_date or target_days
  expect(updateSpy).toHaveBeenCalledWith(
    mockChallenge.id,
    expect.objectContaining({
      name: 'Uống 2.5L nước',
      description: 'Nước lọc và nước ấm',
      base_version: 1,
    }),
  )
})

test('create command_id: retains command_id across unknown-outcome retry of identical canonical create payload, allocates new ID when payload changes', async () => {
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [] })
  const createSpy = vi.spyOn(challengesApi, 'createChallenge')

  const router = createTestRouter()
  await router.push('/challenges')

  const wrapper = mount(ChallengesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()
  await wrapper.get('#create-challenge-btn').trigger('click')

  await wrapper.get('#create-name').setValue('Chạy bộ sáng sớm')
  await wrapper.get('#create-description').setValue('5km mỗi ngày')
  await wrapper.get('#create-target').setValue(3)

  // First attempt fails with unknown outcome / network error
  createSpy.mockRejectedValueOnce(new Error('Network error'))
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(createSpy).toHaveBeenCalledTimes(1)
  const firstCommandId = createSpy.mock.calls[0]![0].command_id
  expect(firstCommandId).toBeTruthy()

  // Retry with IDENTICAL payload -> must reuse firstCommandId
  createSpy.mockRejectedValueOnce(new Error('Network error 2'))
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(createSpy).toHaveBeenCalledTimes(2)
  const secondCommandId = createSpy.mock.calls[1]![0].command_id
  expect(secondCommandId).toBe(firstCommandId)

  // Now user changes payload (e.g. name changed)
  await wrapper.get('#create-name').setValue('Chạy bộ chiều tối')
  createSpy.mockRejectedValueOnce(new Error('Network error 3'))
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(createSpy).toHaveBeenCalledTimes(3)
  const thirdCommandId = createSpy.mock.calls[2]![0].command_id
  expect(thirdCommandId).not.toBe(firstCommandId)
})

test('update command_id: retains command_id across unknown-outcome retry of identical canonical update payload, allocates new ID when name or description changes', async () => {
  const mockChallenge = {
    id: 'c1111111-2026-4444-9999-000000000001',
    name: 'Đọc sách 30 phút',
    description: 'Mỗi ngày sau khi thức dậy',
    start_date: '2026-09-19',
    target_days: 5,
    row_version: 1,
    created_at: '2026-09-19T10:00:00Z',
    updated_at: '2026-09-19T10:00:00Z',
  }

  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [mockChallenge] })
  const updateSpy = vi.spyOn(challengesApi, 'updateChallengeMetadata')

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
  await wrapper.get('#edit-challenge-btn').trigger('click')

  // 1. First update attempt with changes fails with network error
  await wrapper.get('#edit-name').setValue('Đọc sách 45 phút')
  await wrapper.get('#edit-description').setValue('Mỗi buổi sáng và tối')

  updateSpy.mockRejectedValueOnce(new Error('Network failure during update'))
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(updateSpy).toHaveBeenCalledTimes(1)
  const firstCommandId = updateSpy.mock.calls[0]![1].command_id
  expect(firstCommandId).toBeTruthy()

  // 2. Retry with IDENTICAL payload after network failure -> must reuse the same command_id
  updateSpy.mockRejectedValueOnce(new Error('Second network failure'))
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(updateSpy).toHaveBeenCalledTimes(2)
  const secondCommandId = updateSpy.mock.calls[1]![1].command_id
  expect(secondCommandId).toBe(firstCommandId)

  // 3. User changes description after unknown outcome -> must allocate a new command_id
  await wrapper.get('#edit-description').setValue('Mỗi buổi tối trước khi ngủ')
  updateSpy.mockRejectedValueOnce(new Error('Third network failure'))
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(updateSpy).toHaveBeenCalledTimes(3)
  const thirdCommandId = updateSpy.mock.calls[2]![1].command_id
  expect(thirdCommandId).not.toBe(firstCommandId)

  // 4. User changes name after unknown outcome -> must allocate another new command_id
  await wrapper.get('#edit-name').setValue('Đọc sách 60 phút')
  updateSpy.mockResolvedValueOnce({
    challenge: {
      ...mockChallenge,
      name: 'Đọc sách 60 phút',
      description: 'Mỗi buổi tối trước khi ngủ',
      row_version: 2,
    },
    account_revision: 2,
    data_epoch: 1,
  })
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(updateSpy).toHaveBeenCalledTimes(4)
  const fourthCommandId = updateSpy.mock.calls[3]![1].command_id
  expect(fourthCommandId).not.toBe(thirdCommandId)
  expect(fourthCommandId).not.toBe(firstCommandId)
})

test('finding 4: on version conflict, preserves dirty inputs, does not advance editBaseVersion, and disables repeated save', async () => {
  const mockChallenge = {
    id: 'c1111111-2026-4444-9999-000000000001',
    name: 'Học tiếng Nhật ban đầu',
    description: 'Bài 1',
    start_date: '2026-09-19',
    target_days: 5,
    row_version: 1,
    created_at: '2026-09-19T10:00:00Z',
    updated_at: '2026-09-19T10:00:00Z',
  }

  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [mockChallenge] })

  const conflictError = new challengesApi.ChallengeApiError(
    'Xung đột phiên bản.',
    409,
    {
      message: 'Xung đột phiên bản.',
      code: 'version_conflict',
      resource_id: mockChallenge.id,
      current_version: 2,
      current_snapshot: {
        id: mockChallenge.id,
        name: 'Học tiếng Nhật đã sửa trên Tab 2',
        description: 'Bài 2',
        start_date: '2026-09-19',
        target_days: 5,
        row_version: 2,
      },
    },
  )

  const updateSpy = vi.spyOn(challengesApi, 'updateChallengeMetadata').mockRejectedValue(conflictError)

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
  await wrapper.get('#edit-challenge-btn').trigger('click')

  // Edit on Tab 1
  await wrapper.get('#edit-name').setValue('Học tiếng Nhật trên Tab 1')
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  // 1. Conflict alert must be displayed
  expect(wrapper.find('#conflict-alert').exists()).toBe(true)
  expect(wrapper.get('#conflict-alert').text()).toContain('Học tiếng Nhật đã sửa trên Tab 2')

  // 2. Invariant: User's form input must be retained and NOT overwritten!
  expect((wrapper.get('#edit-name').element as HTMLInputElement).value).toBe('Học tiếng Nhật trên Tab 1')

  // 3. Submit button must be disabled to prevent blind resubmission
  const submitBtn = wrapper.get('#edit-submit-btn')
  expect(submitBtn.attributes('disabled')).toBeDefined()

  // 4. Repeated save via form submit is blocked and does not call API again
  updateSpy.mockClear()
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()
  expect(updateSpy).not.toHaveBeenCalled()
})

test('finding 5: fail-closed and disable mutation when account context is not ready or write_state is non-open', async () => {
  const account = useAccountStore()
  account.status = 'loading'
  account.context = null

  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [] })
  const createSpy = vi.spyOn(challengesApi, 'createChallenge')

  const router = createTestRouter()
  await router.push('/challenges')

  const wrapper = mount(ChallengesView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }], router],
    },
  })

  await flushPromises()

  // Account warning banner is displayed
  expect(wrapper.find('#account-status-alert').exists()).toBe(true)
  expect(wrapper.get('#account-status-alert').text()).toContain('Ngữ cảnh tài khoản chưa sẵn sàng')

  // Click create
  await wrapper.get('#create-challenge-btn').trigger('click')

  // Submit button is disabled
  const submitBtn = wrapper.get('#create-submit-btn')
  expect(submitBtn.attributes('disabled')).toBeDefined()

  // Trigger form submit programmatically -> fails closed
  await wrapper.get('#create-name').setValue('Thói quen mới')
  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()

  expect(createSpy).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Ngữ cảnh tài khoản chưa sẵn sàng')

  // Now test non-open write_state
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-19',
    week: { start_date: '2026-09-14', end_date: '2026-09-20' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'locked_for_import',
  }
  await flushPromises()

  expect(wrapper.get('#account-status-alert').text()).toContain('tạm khóa ghi (locked_for_import)')
  expect(submitBtn.attributes('disabled')).toBeDefined()

  await wrapper.get('form').trigger('submit.prevent')
  await flushPromises()
  expect(createSpy).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('tạm khóa ghi (locked_for_import)')
})
