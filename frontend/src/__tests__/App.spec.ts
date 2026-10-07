import { VueQueryPlugin } from '@tanstack/vue-query'
import { beforeEach, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import * as challengesApi from '../api/challenges'
import * as authApi from '../api/auth'
import App from '../App.vue'
import { useAccountStore } from '../stores/account'
import { pinia } from '../pinia'
import { queryClient } from '../queryClient'
import router from '../router'
import { useJournalDraftsStore } from '../stores/journalDrafts'
import { useAuthStore } from '../stores/auth'
import { useSyncStore } from '../stores/sync'

const DATE = '2026-09-27'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(async () => {
  vi.restoreAllMocks()
  queryClient.clear()
  vi.spyOn(challengesApi, 'getChallenges').mockResolvedValue({ challenges: [] })
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  const sync = useSyncStore(pinia)
  sync.stop()
  sync.reset()
  drafts.reset()
  account.reset()
  auth.owner = null
  auth.status = 'guest'
  auth.generation = 0
  vi.spyOn(sync, 'start').mockResolvedValue(true)
  await router.push('/sign-in')
})

test('guests see the owner login without public registration', () => {
  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })

  expect(wrapper.get('h2').text()).toBe('Đăng nhập NoteFlow')
  expect(wrapper.find('form').exists()).toBe(true)
  expect(wrapper.text()).toContain('không mở đăng ký công khai')
  expect(wrapper.find('nav').exists()).toBe(false)
  expect(wrapper.find('main').exists()).toBe(true)
  wrapper.unmount()
})

test('authenticated navigation has the approved order and a clear mobile trigger', async () => {
  const auth = useAuthStore(pinia)
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  const links = wrapper.get('nav[aria-label="Điều hướng chính"]').findAll('a')

  expect(links.map((link) => link.text())).toEqual([
    'Hôm nay',
    'Challenge',
    'Ghi chú',
    'Lịch',
    'Cài đặt',
  ])
  expect(wrapper.get('button[aria-controls="primary-navigation"]').attributes('aria-expanded')).toBe('false')
  wrapper.unmount()
})

test('session expiry removes private route rendering without a navigation round trip', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  await router.push('/challenges')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  await wrapper.get('#create-challenge-btn').trigger('click')
  await wrapper.get('#create-name').setValue('Bản nháp riêng tư')
  expect(wrapper.find('#create-name').exists()).toBe(true)

  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  await auth.refreshSession()
  await flushPromises()

  expect(auth.status).toBe('guest')
  expect(wrapper.find('#create-name').exists()).toBe(false)
  expect(wrapper.find('#session-expired-gate').exists()).toBe(true)
  expect(wrapper.get('#session-expired-gate').text()).toContain('Phiên làm việc đã hết hạn')
  expect(wrapper.get('#session-expired-gate a[href="/sign-in"]').text()).toContain('Đăng nhập lại')
  expect(wrapper.get('#session-expired-gate').text()).not.toContain('Bản nháp riêng tư')
  wrapper.unmount()
})

test.each(['today', 'detail', 'edit'] as const)('session expiry hides private %s content without a route change', async (surface) => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }

  const challenge = {
    id: 'c1111111-2026-4444-9999-000000000001',
    name: 'Riêng tư',
    description: 'Nội dung riêng tư',
    start_date: DATE,
    target_days: 3,
    row_version: 1,
    created_at: '2026-09-19T10:00:00Z',
    updated_at: '2026-09-19T10:00:00Z',
  }
  const privateSelector = surface === 'today' ? '#today-challenges-heading' : surface === 'detail' ? '#challenge-detail-name' : '#edit-name'
  if (surface !== 'today') {
    vi.mocked(challengesApi.getChallenges).mockResolvedValue({ challenges: [challenge] })
  }

  await router.push(surface === 'today' ? '/today' : '/challenges')
  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  if (surface !== 'today') {
    await wrapper.get('li a').trigger('click')
    await flushPromises()
    if (surface === 'edit') await wrapper.get('#edit-challenge-btn').trigger('click')
  }
  expect(wrapper.find(privateSelector).exists()).toBe(true)

  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  await auth.refreshSession()
  await flushPromises()

  expect(wrapper.find(privateSelector).exists()).toBe(false)
  expect(wrapper.find('#session-expired-gate').exists()).toBe(true)
  wrapper.unmount()
})

test('beforeunload warns when an in-memory journal draft is unsaved', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: DATE, journal: 'saved', journal_version: 1 })
  drafts.setDraftText('challenge-a', DATE, 'unsaved draft')
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)

  expect(event.defaultPrevented).toBe(true)
  wrapper.unmount()
  const afterUnmount = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(afterUnmount)
  expect(afterUnmount.defaultPrevented).toBe(false)
})

test('same-owner warning guards stay active while session refresh is pending', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: DATE, journal: 'saved', journal_version: 1 })
  drafts.setDraftText('challenge-a', DATE, 'owner 42 private draft')
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  const session = deferred<authApi.OwnerSession | null>()
  vi.spyOn(authApi, 'getSession').mockReturnValue(session.promise)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
  const refreshing = auth.refreshSession()
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)

  await wrapper.get('nav button').trigger('click')

  expect(event.defaultPrevented).toBe(true)
  expect(confirm).toHaveBeenCalledOnce()
  expect(logout).not.toHaveBeenCalled()

  session.resolve({ owner: { id: 42, name: 'Owner', email: 'owner@example.test' } })
  await refreshing
  wrapper.unmount()
})

test('a new owner is not warned about another owner’s quarantined draft after session expiry', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: DATE, journal: 'saved', journal_version: 1 })
  drafts.setDraftText('challenge-a', DATE, 'owner 42 private draft')

  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  await auth.refreshSession()
  vi.spyOn(authApi, 'login').mockResolvedValue({
    owner: { id: 43, name: 'Other owner', email: 'other@example.test' },
    redirect_to: '/today',
  } as authApi.LoginResult)
  await auth.logIn({ email: 'other@example.test', password: 'secret' })
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 12,
    data_epoch: 4,
    write_state: 'open',
  }

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(Object.values(drafts.drafts)[0]).toMatchObject({ ownerId: 42, status: 'quarantined' })
  await wrapper.get('nav button').trigger('click')

  expect(event.defaultPrevented).toBe(false)
  expect(confirm).not.toHaveBeenCalled()
  expect(logout).toHaveBeenCalledOnce()
  wrapper.unmount()
})

test('a clean journal record does not warn before unload', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: DATE, journal: 'saved', journal_version: 1 })
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)

  expect(event.defaultPrevented).toBe(false)
  wrapper.unmount()
})

test('canceling logout with a draft leaves the private session and sync running', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  const sync = useSyncStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: DATE, journal: 'saved', journal_version: 1 })
  drafts.setDraftText('challenge-a', DATE, 'unsaved draft')
  queryClient.setQueryData(['private-test'], { ownerId: 42 })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
  const stop = vi.spyOn(sync, 'stop')
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  await wrapper.get('nav button').trigger('click')

  expect(confirm).toHaveBeenCalledOnce()
  expect(logout).not.toHaveBeenCalled()
  expect(stop).not.toHaveBeenCalled()
  expect(auth.status).toBe('authenticated')
  expect(queryClient.getQueryData(['private-test'])).toEqual({ ownerId: 42 })
  expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({ text: 'unsaved draft', status: 'dirty' })
  wrapper.unmount()
})

test('a failed confirmed logout keeps the draft and reports the error without stopping sync', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  const sync = useSyncStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: DATE, journal: 'saved', journal_version: 1 })
  drafts.setDraftText('challenge-a', DATE, 'unsaved draft')
  queryClient.setQueryData(['private-test'], { ownerId: 42 })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('logout unavailable'))
  const stop = vi.spyOn(sync, 'stop')
  const generation = auth.generation
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  await wrapper.get('nav button').trigger('click')
  await Promise.resolve()
  await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))

  expect(auth.status).toBe('authenticated')
  expect(auth.generation).toBe(generation)
  expect(stop).not.toHaveBeenCalled()
  expect(queryClient.getQueryData(['private-test'])).toEqual({ ownerId: 42 })
  expect(drafts.getDraft('challenge-a', DATE)).toMatchObject({ text: 'unsaved draft', status: 'dirty' })
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  wrapper.unmount()
})

test('a confirmed successful logout clears private state and stops sync', async () => {
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  const drafts = useJournalDraftsStore(pinia)
  const sync = useSyncStore(pinia)
  auth.owner = { id: 42, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 1
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: DATE,
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 11,
    data_epoch: 4,
    write_state: 'open',
  }
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: DATE, journal: 'saved', journal_version: 1 })
  drafts.setDraftText('challenge-a', DATE, 'unsaved draft')
  queryClient.setQueryData(['private-test'], { ownerId: 42 })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
  const stop = vi.spyOn(sync, 'stop')
  await router.push('/today')

  const wrapper = mount(App, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  await wrapper.get('nav button').trigger('click')

  expect(logout).toHaveBeenCalledOnce()
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
  expect(stop).toHaveBeenCalledOnce()
  expect(auth.status).toBe('guest')
  expect(auth.owner).toBeNull()
  expect(queryClient.getQueryData(['private-test'])).toBeUndefined()
  expect(drafts.getDraft('challenge-a', DATE)).toBeUndefined()
  wrapper.unmount()
})
