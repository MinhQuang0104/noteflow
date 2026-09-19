import { defineStore } from 'pinia'
import { ref } from 'vue'

import * as accountApi from '../api/account'
import type { AccountContext } from '../api/account'
import { useAuthStore } from './auth'

export type AccountContextStatus = 'unknown' | 'loading' | 'ready' | 'error'

export const useAccountStore = defineStore('account', () => {
  const auth = useAuthStore()
  const context = ref<AccountContext | null>(null)
  const status = ref<AccountContextStatus>('unknown')

  function reset(): void {
    context.value = null
    status.value = 'unknown'
  }

  auth.registerPrivateStateReset(reset)

  async function refresh(): Promise<boolean> {
    const requestGeneration = auth.generation
    status.value = 'loading'

    try {
      const nextContext = await accountApi.getAccountContext()

      if (requestGeneration !== auth.generation) return false

      context.value = nextContext
      status.value = 'ready'
      return true
    } catch (error) {
      const responseStatus =
        typeof error === 'object' && error !== null && 'status' in error ? error.status : null

      if (responseStatus === 401 || responseStatus === 403) {
        await auth.refreshSession()
        return false
      }

      if (requestGeneration === auth.generation) {
        context.value = null
        status.value = 'error'
      }
      throw error
    }
  }

  return { context, status, refresh, reset }
})
