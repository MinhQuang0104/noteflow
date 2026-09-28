import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'

import * as accountApi from '../../api/account'
import * as authApi from '../../api/auth'
import { useAccountStore } from '../account'
import { useAuthStore } from '../auth'
import { useJournalDraftsStore } from '../journalDrafts'

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

test('an expired account request clears private context and keeps the draft quarantined in memory', async () => {
  vi.spyOn(accountApi, 'getAccountContext').mockRejectedValue(
    Object.assign(new Error('expired'), { status: 401 }),
  )
  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  const auth = useAuthStore()
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  const account = useAccountStore()
  const drafts = useJournalDraftsStore()
  account.context = {
    timezone: 'Asia/Ho_Chi_Minh',
    account_date: '2026-09-21',
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
    account_revision: 1,
    data_epoch: 1,
    write_state: 'open',
  }
  account.status = 'ready'
  drafts.hydrate({ challenge_id: 'challenge-a', local_date: '2026-09-21', journal: 'saved', journal_version: 1 })
  drafts.setDraftText('challenge-a', '2026-09-21', 'private unsaved text')

  await expect(account.refresh()).resolves.toBe(false)

  expect(auth.status).toBe('guest')
  expect(auth.owner).toBeNull()
  expect(account.context).toBeNull()
  expect(account.status).toBe('unknown')
  expect(drafts.getDraft('challenge-a', '2026-09-21')).toBeUndefined()
  expect(Object.values(drafts.drafts)).toHaveLength(1)
  expect(Object.values(drafts.drafts)[0]).toMatchObject({
    text: 'private unsaved text',
    status: 'quarantined',
  })
})
