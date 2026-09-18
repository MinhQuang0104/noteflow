import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as authApi from '../api/auth'
import type { LoginInput, Owner } from '../api/auth'

export type AuthStatus = 'unknown' | 'loading' | 'authenticated' | 'guest'

export const useAuthStore = defineStore('auth', () => {
  const owner = ref<Owner | null>(null)
  const status = ref<AuthStatus>('unknown')
  const generation = ref(0)
  const privateStateResets = new Set<() => void>()

  function clearPrivateState(): void {
    for (const reset of privateStateResets) reset()
    owner.value = null
  }

  async function refreshSession(): Promise<boolean> {
    const requestGeneration = generation.value
    status.value = 'loading'
    const session = await authApi.getSession()

    if (requestGeneration !== generation.value) return false

    if (!session) {
      generation.value += 1
      clearPrivateState()
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
    generation.value += 1
    await authApi.logout()
    clearPrivateState()
    status.value = 'guest'
  }

  function registerPrivateStateReset(reset: () => void): () => void {
    privateStateResets.add(reset)
    return () => privateStateResets.delete(reset)
  }

  return { owner, status, generation, refreshSession, logIn, logOut, registerPrivateStateReset }
})
