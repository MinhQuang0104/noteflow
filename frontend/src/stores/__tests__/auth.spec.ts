import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'

import * as authApi from '../../api/auth'
import { useAuthStore } from '../auth'

type PrivateStateResetReason = 'session_expired' | 'logout'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

test('a session response that arrives after logout cannot restore private state', async () => {
  let resolveSession!: (value: authApi.OwnerSession) => void
  vi.spyOn(authApi, 'getSession').mockReturnValue(
    new Promise((resolve) => {
      resolveSession = resolve
    }),
  )
  vi.spyOn(authApi, 'logout').mockResolvedValue()
  const auth = useAuthStore()
  const pendingSession = auth.refreshSession()

  await auth.logOut()
  resolveSession({ owner: { id: 1, name: 'Owner', email: 'owner@example.test' } })
  await pendingSession

  expect(auth.owner).toBeNull()
  expect(auth.status).toBe('guest')
  expect(auth.generation).toBe(1)
})

test('logout clears registered private state before exposing the guest shell', async () => {
  vi.spyOn(authApi, 'logout').mockResolvedValue()
  const auth = useAuthStore()
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  const clear = vi.fn<(reason: PrivateStateResetReason) => void>()
  auth.registerPrivateStateReset(clear)

  await auth.logOut()

  expect(clear).toHaveBeenCalledExactlyOnceWith('logout')
  expect(auth.owner).toBeNull()
  expect(auth.status).toBe('guest')
})

test('a failed explicit logout keeps the authenticated generation and private state', async () => {
  const failure = new Error('logout unavailable')
  vi.spyOn(authApi, 'logout').mockRejectedValue(failure)
  const auth = useAuthStore()
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 7
  const clear = vi.fn<(reason: PrivateStateResetReason) => void>()
  auth.registerPrivateStateReset(clear)

  await expect(auth.logOut()).rejects.toBe(failure)

  expect(auth.generation).toBe(7)
  expect(auth.owner).toMatchObject({ id: 1 })
  expect(auth.status).toBe('authenticated')
  expect(clear).not.toHaveBeenCalled()
})

test('session expiry advances the generation and identifies the private-state reset reason', async () => {
  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  const auth = useAuthStore()
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  const clear = vi.fn<(reason: PrivateStateResetReason) => void>()
  auth.registerPrivateStateReset(clear)

  await auth.refreshSession()

  expect(auth.generation).toBe(1)
  expect(clear).toHaveBeenCalledExactlyOnceWith('session_expired')
  expect(auth.owner).toBeNull()
  expect(auth.status).toBe('guest')
})

test('a session-expiry response during a failed explicit logout does not clear private state', async () => {
  let rejectLogout!: (error: unknown) => void
  vi.spyOn(authApi, 'logout').mockReturnValue(
    new Promise<void>((_resolve, reject) => {
      rejectLogout = reject
    }),
  )
  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  const auth = useAuthStore()
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  auth.generation = 7
  const clear = vi.fn<(reason: PrivateStateResetReason) => void>()
  auth.registerPrivateStateReset(clear)

  const logout = auth.logOut()
  await auth.refreshSession()
  rejectLogout(new Error('logout unavailable'))

  await expect(logout).rejects.toThrow('logout unavailable')
  expect(auth.generation).toBe(7)
  expect(auth.owner).toMatchObject({ id: 1 })
  expect(auth.status).toBe('authenticated')
  expect(clear).not.toHaveBeenCalled()
})

test('failed login returns the store to guest state', async () => {
  vi.spyOn(authApi, 'login').mockRejectedValue(new Error('invalid credentials'))
  const auth = useAuthStore()

  await expect(auth.logIn({ email: 'owner@example.test', password: 'wrong' })).rejects.toThrow(
    'invalid credentials',
  )

  expect(auth.status).toBe('guest')
  expect(auth.owner).toBeNull()
})
