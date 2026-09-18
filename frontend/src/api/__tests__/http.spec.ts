import { afterEach, expect, test, vi } from 'vitest'

import { getFoundationHealth } from '../http'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('foundation requests use the relative same-origin API boundary', async () => {
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok', service: 'noteflow-api' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchSpy)

  await expect(getFoundationHealth()).resolves.toEqual({
    status: 'ok',
    service: 'noteflow-api',
  })
  expect(fetchSpy).toHaveBeenCalledWith('/api/v1/foundation', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
})

test('foundation requests surface an unavailable API', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })))

  await expect(getFoundationHealth()).rejects.toThrow('Foundation API request failed with 503')
})
