import { VueQueryPlugin } from '@tanstack/vue-query'
import { beforeEach, expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'

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
