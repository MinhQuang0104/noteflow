import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'

import * as accountApi from '../../api/account'
import * as authApi from '../../api/auth'
import { useAccountStore } from '../account'
import { useAuthStore } from '../auth'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

test('a late account response cannot restore context after logout', async () => {
  let resolveContext!: (value: accountApi.AccountContext) => void
  vi.spyOn(accountApi, 'getAccountContext').mockReturnValue(
    new Promise((resolve) => {
      resolveContext = resolve
    }),
  )
  vi.spyOn(authApi, 'logout').mockResolvedValue()
  const auth = useAuthStore()
  auth.status = 'authenticated'
  const account = useAccountStore()

  const pending = account.refresh()
  await auth.logOut()
  resolveContext({
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-21',
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  })
  await pending

  expect(account.context).toBeNull()
  expect(account.status).toBe('unknown')
})

test('an account API error remains explicit and does not synthesize device time', async () => {
  vi.spyOn(accountApi, 'getAccountContext').mockRejectedValue(new Error('unavailable'))
  const auth = useAuthStore()
  auth.status = 'authenticated'
  const account = useAccountStore()

  await expect(account.refresh()).rejects.toThrow('unavailable')

  expect(account.context).toBeNull()
  expect(account.status).toBe('error')
})

test('an expired account request reconciles auth and clears private context', async () => {
  vi.spyOn(accountApi, 'getAccountContext').mockRejectedValue(
    Object.assign(new Error('expired'), { status: 401 }),
  )
  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  const auth = useAuthStore()
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  const account = useAccountStore()
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-21',
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  }
  account.status = 'ready'

  await expect(account.refresh()).resolves.toBe(false)

  expect(auth.status).toBe('guest')
  expect(auth.owner).toBeNull()
  expect(account.context).toBeNull()
  expect(account.status).toBe('unknown')
})
