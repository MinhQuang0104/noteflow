import { beforeEach, expect, test, vi } from 'vitest'

import * as authApi from '../../api/auth'
import { pinia } from '../../pinia'
import { useAuthStore } from '../../stores/auth'
import router from '..'

beforeEach(async () => {
  vi.restoreAllMocks()
  const auth = useAuthStore(pinia)
  auth.owner = null
  auth.status = 'guest'
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

  await router.push('/notes')
  await router.push('/sign-in')

  expect(router.currentRoute.value.name).toBe('today')
})
