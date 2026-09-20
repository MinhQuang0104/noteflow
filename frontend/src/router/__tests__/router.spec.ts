import { beforeEach, expect, test, vi } from 'vitest'

import * as authApi from '../../api/auth'
import * as accountApi from '../../api/account'
import { pinia } from '../../pinia'
import { useAccountStore } from '../../stores/account'
import { useAuthStore } from '../../stores/auth'
import router from '..'

beforeEach(async () => {
  vi.restoreAllMocks()
  const auth = useAuthStore(pinia)
  const account = useAccountStore(pinia)
  auth.owner = null
  auth.status = 'guest'
  account.reset()
  await router.push('/sign-in')
})

test('an unauthenticated deep link is preserved for login', async () => {
  const auth = useAuthStore(pinia)
  auth.status = 'unknown'
  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)

  await router.push('/notes')

  expect(router.currentRoute.value.name).toBe('login')
  expect(router.currentRoute.value.query.redirect).toBe('/notes')
})

test('an authenticated owner cannot return to the login view', async () => {
  const auth = useAuthStore(pinia)
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  const account = useAccountStore(pinia)
  account.status = 'ready'
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-21',
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  }

  await router.push('/notes')
  await router.push('/sign-in')

  expect(router.currentRoute.value.name).toBe('today')
})

test('an expired account-context request sends the owner back to login', async () => {
  const auth = useAuthStore(pinia)
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  vi.spyOn(accountApi, 'getAccountContext').mockRejectedValue(
    Object.assign(new Error('expired'), { status: 401 }),
  )
  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)

  await router.push('/today')

  expect(router.currentRoute.value.name).toBe('login')
  expect(router.currentRoute.value.query.redirect).toBe('/today')
})
