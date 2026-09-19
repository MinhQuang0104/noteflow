import { afterEach, expect, test, vi } from 'vitest'

import { getAccountContext } from '../account'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('account context uses the private same-origin API and preserves canonical date strings', async () => {
  const payload = {
    timezone: 'Asia/Ho_Chi_Minh' as const,
    account_date: '2026-09-21',
    week: { start_date: '2026-09-21', end_date: '2026-09-27' },
  }
  const fetchSpy = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)

  await expect(getAccountContext()).resolves.toEqual(payload)
  expect(fetchSpy).toHaveBeenCalledWith('/api/v1/account', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
})

test('account context never falls back to a device date after an API failure', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })))

  await expect(getAccountContext()).rejects.toThrow('Account context request failed with 503')
})
