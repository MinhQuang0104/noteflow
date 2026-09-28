import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as authApi from '../api/auth'
import type { LoginInput, Owner } from '../api/auth'
import { queryClient } from '../queryClient'

export type AuthStatus = 'unknown' | 'loading' | 'authenticated' | 'guest'
export type PrivateStateResetReason = 'session_expired' | 'logout'

export const useAuthStore = defineStore('auth', () => {
  const owner = ref<Owner | null>(null)
  const status = ref<AuthStatus>('unknown')
  const generation = ref(0)
  const privateStateResets = new Set<(reason: PrivateStateResetReason) => void>()
  let explicitLogoutPending = false

  function clearPrivateState(reason: PrivateStateResetReason): void {
    for (const reset of privateStateResets) reset(reason)
    queryClient.clear()
    owner.value = null
  }

  async function refreshSession(): Promise<boolean> {
    if (explicitLogoutPending) return false

    const requestGeneration = generation.value
    status.value = 'loading'
    const session = await authApi.getSession()

    if (explicitLogoutPending) return false
    if (requestGeneration !== generation.value) return false

    if (!session) {
      generation.value += 1
      clearPrivateState('session_expired')
      status.value = 'guest'
      return false
    }

    owner.value = session.owner
    status.value = 'authenticated'
    return true
  }

  async function logIn(input: LoginInput): Promise<string> {
    status.value = 'loading'
    try {
      const result = await authApi.login(input)
      generation.value += 1
      owner.value = result.owner
      status.value = 'authenticated'

      return result.redirect_to
    } catch (error) {
      status.value = 'guest'
      throw error
    }
  }

  async function logOut(): Promise<void> {
    if (explicitLogoutPending) return

    const requestGeneration = generation.value
    const previousStatus = status.value === 'loading'
      ? owner.value ? 'authenticated' : 'guest'
      : status.value
    explicitLogoutPending = true

    try {
      await authApi.logout()
    } catch (error) {
      explicitLogoutPending = false
      if (generation.value === requestGeneration && status.value === 'loading') {
        status.value = previousStatus
      }
      throw error
    }

    if (generation.value === requestGeneration) {
      generation.value += 1
      clearPrivateState('logout')
      status.value = 'guest'
    }
    explicitLogoutPending = false
  }

  function registerPrivateStateReset(reset: (reason: PrivateStateResetReason) => void): () => void {
    privateStateResets.add(reset)
    return () => privateStateResets.delete(reset)
  }

  return { owner, status, generation, refreshSession, logIn, logOut, registerPrivateStateReset }
})
