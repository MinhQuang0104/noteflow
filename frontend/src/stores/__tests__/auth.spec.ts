import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, test, vi } from 'vitest'

import * as authApi from '../../api/auth'
import { useAuthStore } from '../auth'

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
  const clear = vi.fn<() => void>()
  auth.registerPrivateStateReset(clear)

  await auth.logOut()

  expect(clear).toHaveBeenCalledOnce()
  expect(auth.owner).toBeNull()
  expect(auth.status).toBe('guest')
})

test('session expiry advances the generation and clears private state', async () => {
  vi.spyOn(authApi, 'getSession').mockResolvedValue(null)
  const auth = useAuthStore()
  auth.owner = { id: 1, name: 'Owner', email: 'owner@example.test' }
  auth.status = 'authenticated'
  const clear = vi.fn<() => void>()
  auth.registerPrivateStateReset(clear)

  await auth.refreshSession()

  expect(auth.generation).toBe(1)
  expect(clear).toHaveBeenCalledOnce()
  expect(auth.owner).toBeNull()
  expect(auth.status).toBe('guest')
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
