import type { components } from './schema.generated'

export type Challenge = components['schemas']['Challenge']
export type ChallengeSnapshot = components['schemas']['ChallengeSnapshot']
export type ChallengeListResult = components['schemas']['ChallengeListResult']
export type ChallengeDetailResult = components['schemas']['ChallengeDetailResult']
export type ChallengeMutationResult = components['schemas']['ChallengeMutationResult']
export type CreateChallengeRequest = components['schemas']['CreateChallengeRequest']
export type UpdateChallengeMetadataRequest = components['schemas']['UpdateChallengeMetadataRequest']
export type ProblemDetails = components['schemas']['ProblemDetails']
export type ValidationError = components['schemas']['ValidationError']

export class ChallengeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problem?: ProblemDetails,
    readonly validation?: ValidationError,
  ) {
    super(message)
    this.name = 'ChallengeApiError'
  }
}

export function xsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const encodedToken = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length)

  return encodedToken ? decodeURIComponent(encodedToken) : null
}

export function generateCommandId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = xsrfToken()
  const headers: Record<string, string> = {
    Accept: 'application/json, application/problem+json',
    ...(init?.headers as Record<string, string> | undefined),
  }

  if (init?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (token && init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method.toUpperCase())) {
    headers['X-XSRF-TOKEN'] = token
  }

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers,
  })

  if (response.ok) {
    return (await response.json()) as T
  }

  let problem: ProblemDetails | undefined
  let validation: ValidationError | undefined
  let message = `Challenge request failed with status ${response.status}`

  try {
    const errorBody = await response.json()
    if (response.status === 422) {
      validation = errorBody as ValidationError
      message = validation.message || 'Dữ liệu không hợp lệ.'
    } else if (response.status === 409 || response.status === 423) {
      problem = errorBody as ProblemDetails
      message = problem.message || 'Xung đột phiên bản dữ liệu.'
    } else if (errorBody?.message) {
      message = errorBody.message
    }
  } catch {
    // Non-JSON response
  }

  throw new ChallengeApiError(message, response.status, problem, validation)
}

export async function getChallenges(): Promise<ChallengeListResult> {
  return requestJson<ChallengeListResult>('/api/v1/challenges')
}

export async function getChallenge(id: string): Promise<ChallengeDetailResult> {
  return requestJson<ChallengeDetailResult>(`/api/v1/challenges/${encodeURIComponent(id)}`)
}

export async function createChallenge(payload: CreateChallengeRequest): Promise<ChallengeMutationResult> {
  return requestJson<ChallengeMutationResult>('/api/v1/challenges', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateChallengeMetadata(
  id: string,
  payload: UpdateChallengeMetadataRequest,
): Promise<ChallengeMutationResult> {
  return requestJson<ChallengeMutationResult>(`/api/v1/challenges/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}
