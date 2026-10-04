import type { components } from './schema.generated'

export type Challenge = components['schemas']['Challenge']
export type ChallengeSnapshot = components['schemas']['ChallengeSnapshot']
export type ChallengeListResult = components['schemas']['ChallengeListResult']
export type ChallengeDetailResult = components['schemas']['ChallengeDetailResult']
export type ChallengeMutationResult = components['schemas']['ChallengeMutationResult']
export type JournalSnapshot = components['schemas']['JournalSnapshot']
export type JournalReadResult = components['schemas']['JournalReadResult']
export type JournalMutationResult = components['schemas']['JournalMutationResult']
export type SaveJournalRequest = components['schemas']['SaveJournalRequest']
export type CreateChallengeRequest = components['schemas']['CreateChallengeRequest']
export type UpdateChallengeMetadataRequest = components['schemas']['UpdateChallengeMetadataRequest']
export type ProblemDetails = components['schemas']['ProblemDetails']
export type ValidationError = components['schemas']['ValidationError']
export type ChallengeProblemDetails = Omit<ProblemDetails, 'current_snapshot'> & {
  current_snapshot?: ChallengeSnapshot
}
export type JournalProblemDetails = Omit<ProblemDetails, 'current_snapshot'> & {
  current_snapshot?: JournalSnapshot
}

const problemCodes: ReadonlySet<ProblemDetails['code']> = new Set([
  'version_conflict',
  'stale_data_epoch',
  'idempotency_key_reused',
  'write_fence_active',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isJournalSnapshot(value: unknown): value is JournalSnapshot {
  if (!isRecord(value)) return false
  if (Object.keys(value).some((key) => !['challenge_id', 'local_date', 'journal', 'journal_version'].includes(key))) return false
  return typeof value.challenge_id === 'string' && value.challenge_id.length > 0 &&
    typeof value.local_date === 'string' && value.local_date.length > 0 &&
    (typeof value.journal === 'string' || value.journal === null) &&
    isNonNegativeInteger(value.journal_version)
}

function parseJournalProblemDetails(value: unknown): JournalProblemDetails | undefined {
  if (!isRecord(value) || typeof value.message !== 'string' ||
    typeof value.code !== 'string' || !problemCodes.has(value.code as ProblemDetails['code'])) return undefined

  if (value.resource_id !== undefined && (typeof value.resource_id !== 'string' || value.resource_id.length === 0)) return undefined
  if (value.current_version !== undefined && !isNonNegativeInteger(value.current_version)) return undefined

  const currentSnapshot = value.current_snapshot
  if (currentSnapshot !== undefined && !isJournalSnapshot(currentSnapshot)) return undefined
  if (currentSnapshot !== undefined && value.current_version !== currentSnapshot.journal_version) return undefined

  if (value.code === 'version_conflict' &&
    (typeof value.resource_id !== 'string' || value.resource_id.length === 0 ||
      !isNonNegativeInteger(value.current_version) || !isJournalSnapshot(currentSnapshot))) return undefined

  return {
    message: value.message,
    code: value.code as JournalProblemDetails['code'],
    ...(value.resource_id !== undefined ? { resource_id: value.resource_id as string } : {}),
    ...(value.current_version !== undefined ? { current_version: value.current_version } : {}),
    ...(currentSnapshot !== undefined ? { current_snapshot: currentSnapshot } : {}),
  }
}

export class ChallengeApiError<TProblem extends ProblemDetails = ChallengeProblemDetails> extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problem?: TProblem,
    readonly validation?: ValidationError,
  ) {
    super(message)
    this.name = 'ChallengeApiError'
  }
}

type ProblemParser<TProblem extends ProblemDetails> = (value: unknown) => TProblem | undefined

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

async function requestJson<T, TProblem extends ProblemDetails = ChallengeProblemDetails>(
  path: string,
  init?: RequestInit,
  problemParser?: ProblemParser<TProblem>,
): Promise<T> {
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

  let problem: TProblem | undefined
  let validation: ValidationError | undefined
  let message = `Challenge request failed with status ${response.status}`

  try {
    const errorBody = await response.json()
    if (response.status === 422) {
      validation = errorBody as ValidationError
      message = validation.message || 'Dữ liệu không hợp lệ.'
    } else if (response.status === 409 || response.status === 423) {
      problem = problemParser ? problemParser(errorBody) : errorBody as TProblem
      if (problem) message = problem.message || 'Xung đột phiên bản dữ liệu.'
      else if (isRecord(errorBody) && typeof errorBody.message === 'string') message = errorBody.message
    } else if (errorBody?.message) {
      message = errorBody.message
    }
  } catch {
    // Non-JSON response
  }

  throw new ChallengeApiError<TProblem>(message, response.status, problem, validation)
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

export async function getChallengeJournal(id: string, date: string): Promise<JournalReadResult> {
  return requestJson<JournalReadResult, JournalProblemDetails>(
    `/api/v1/challenges/${encodeURIComponent(id)}/journals/${encodeURIComponent(date)}`,
  )
}

export async function saveChallengeJournal(
  id: string,
  date: string,
  payload: SaveJournalRequest,
): Promise<JournalMutationResult> {
  return requestJson<JournalMutationResult, JournalProblemDetails>(
    `/api/v1/challenges/${encodeURIComponent(id)}/journals/${encodeURIComponent(date)}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    parseJournalProblemDetails,
  )
}
