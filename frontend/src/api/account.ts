import type { components } from './schema.generated'

export type AccountContext = components['schemas']['AccountContext']

export class AccountContextError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function getAccountContext(): Promise<AccountContext> {
  const response = await fetch('/api/v1/account', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new AccountContextError(`Account context request failed with ${response.status}`, response.status)
  }

  return (await response.json()) as AccountContext
}
