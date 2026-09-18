import { afterEach, expect, test, vi } from 'vitest'

import { getSession, login, logout } from '../auth'

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(document, 'cookie', { value: '', writable: true })
})

test('login initializes Sanctum csrf and sends the decoded token with same-origin credentials', async () => {
  Object.defineProperty(document, 'cookie', {
    value: 'XSRF-TOKEN=csrf%20token',
    writable: true,
  })
  const fetchSpy = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          owner: { id: 1, name: 'Owner', email: 'owner@example.test' },
          redirect_to: '/today',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
  vi.stubGlobal('fetch', fetchSpy)

  await login({ email: 'owner@example.test', password: 'secret', redirectTo: '/today' })

  expect(fetchSpy).toHaveBeenNthCalledWith(1, '/sanctum/csrf-cookie', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  expect(fetchSpy).toHaveBeenNthCalledWith(
    2,
    '/login',
    expect.objectContaining({
      credentials: 'same-origin',
      method: 'POST',
      headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'csrf token' }),
    }),
  )
})

test('session expiry is represented as an unauthenticated session without leaking a response body', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 })))

  await expect(getSession()).resolves.toBeNull()
})

test('logout is csrf protected', async () => {
  Object.defineProperty(document, 'cookie', { value: 'XSRF-TOKEN=token', writable: true })
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchSpy)

  await logout()

  expect(fetchSpy).toHaveBeenCalledWith(
    '/logout',
    expect.objectContaining({
      credentials: 'same-origin',
      method: 'POST',
      headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'token' }),
    }),
  )
})

test('a csrf expiry is surfaced as a typed authentication error', async () => {
  Object.defineProperty(document, 'cookie', { value: 'XSRF-TOKEN=stale', writable: true })
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'expired', code: 'csrf_expired' }), {
          status: 419,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  )

  await expect(login({ email: 'owner@example.test', password: 'secret' })).rejects.toMatchObject({
    status: 419,
    message: 'Phiên bảo mật đã hết hạn. Vui lòng thử lại.',
  })
})
