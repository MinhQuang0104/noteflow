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
export type StateProblemDetails = components['schemas']['StateProblemDetails']
export type ChallengeConflictProblemDetails = components['schemas']['ChallengeConflictProblemDetails']
export type JournalConflictProblemDetails = components['schemas']['JournalConflictProblemDetails']
export type ProblemDetails = StateProblemDetails | ChallengeConflictProblemDetails | JournalConflictProblemDetails
export type ValidationError = components['schemas']['ValidationError']
export type ChallengeProblemDetails = components['schemas']['ChallengeProblemDetails']
export type JournalProblemDetails = components['schemas']['JournalProblemDetails']

const stateProblemCodes: ReadonlySet<StateProblemDetails['code']> = new Set([
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value)
}

function parseStateProblemDetails(value: unknown): StateProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['message', 'code']) ||
    typeof value.message !== 'string' || typeof value.code !== 'string' ||
    !stateProblemCodes.has(value.code as StateProblemDetails['code'])) {
    return undefined
  }

  return {
    message: value.message,
    code: value.code as StateProblemDetails['code'],
  }
}

export function isChallengeSnapshot(value: unknown): value is ChallengeSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id',
    'name',
    'description',
    'start_date',
    'target_days',
    'row_version',
  ])) return false

  return typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.name === 'string' &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.start_date === 'string' && value.start_date.length > 0 &&
    typeof value.target_days === 'number' && Number.isInteger(value.target_days) &&
    value.target_days >= 1 && value.target_days <= 7 &&
    isPositiveInteger(value.row_version)
}

function parseChallengeConflictProblemDetails(value: unknown): ChallengeConflictProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    'message',
    'code',
    'resource_id',
    'current_version',
    'current_snapshot',
  ]) || value.code !== 'version_conflict' || typeof value.message !== 'string' ||
    typeof value.resource_id !== 'string' || value.resource_id.length === 0 ||
    !isPositiveInteger(value.current_version) || !isChallengeSnapshot(value.current_snapshot)) {
    return undefined
  }

  return {
    message: value.message,
    code: 'version_conflict',
    resource_id: value.resource_id,
    current_version: value.current_version,
    current_snapshot: value.current_snapshot,
  }
}

export function parseChallengeProblemDetails(value: unknown): ChallengeProblemDetails | undefined {
  return parseStateProblemDetails(value) ?? parseChallengeConflictProblemDetails(value)
}

export function isJournalSnapshot(value: unknown): value is JournalSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ['challenge_id', 'local_date', 'journal', 'journal_version'])) return false
  return typeof value.challenge_id === 'string' && value.challenge_id.length > 0 &&
    typeof value.local_date === 'string' && value.local_date.length > 0 &&
    (typeof value.journal === 'string' || value.journal === null) &&
    isNonNegativeInteger(value.journal_version)
}

function parseJournalConflictProblemDetails(value: unknown): JournalConflictProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    'message',
    'code',
    'resource_id',
    'current_version',
    'current_snapshot',
  ]) || value.code !== 'version_conflict' || typeof value.message !== 'string' ||
    typeof value.resource_id !== 'string' || value.resource_id.length === 0 ||
    !isPositiveInteger(value.current_version) || !isJournalSnapshot(value.current_snapshot) ||
    value.current_version !== value.current_snapshot.journal_version) {
    return undefined
  }

  return {
    message: value.message,
    code: 'version_conflict',
    resource_id: value.resource_id,
    current_version: value.current_version,
    current_snapshot: value.current_snapshot,
  }
}

function parseJournalProblemDetails(value: unknown): JournalProblemDetails | undefined {
  return parseStateProblemDetails(value) ?? parseJournalConflictProblemDetails(value)
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
  return requestJson<ChallengeMutationResult, ChallengeProblemDetails>('/api/v1/challenges', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, parseChallengeProblemDetails)
}

export async function updateChallengeMetadata(
  id: string,
  payload: UpdateChallengeMetadataRequest,
): Promise<ChallengeMutationResult> {
  return requestJson<ChallengeMutationResult, ChallengeProblemDetails>(`/api/v1/challenges/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, parseChallengeProblemDetails)
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
