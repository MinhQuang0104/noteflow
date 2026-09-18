import type { components } from './schema.generated'

export type FoundationHealth = components['schemas']['FoundationHealth']

export async function getFoundationHealth(): Promise<FoundationHealth> {
  const response = await fetch('/api/v1/foundation', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Foundation API request failed with ${response.status}`)
  }

  return (await response.json()) as FoundationHealth
}
