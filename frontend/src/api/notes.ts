import { generateCommandId, xsrfToken } from './challenges'
import type { components } from './schema.generated'

export type Note = components['schemas']['Note']
export type NoteListResult = components['schemas']['NoteListResult']
export type NoteMutationResult = components['schemas']['NoteMutationResult']
export type CreateNoteRequest = components['schemas']['CreateNoteRequest']
export type UpdateNoteRequest = components['schemas']['UpdateNoteRequest']
export type StateProblemDetails = components['schemas']['StateProblemDetails']
export type NoteConflictProblemDetails = components['schemas']['NoteConflictProblemDetails']
export type NoteContentProblemDetails = components['schemas']['NoteContentProblemDetails']
export type NoteUpdateProblemDetails = components['schemas']['NoteUpdateProblemDetails']
export type NoteCreateProblemDetails = StateProblemDetails | NoteContentProblemDetails
export type NoteProblemDetails = StateProblemDetails | NoteConflictProblemDetails | NoteContentProblemDetails
export type ValidationError = components['schemas']['ValidationError']

export { generateCommandId }

const noteKeys = ['id', 'notebook_id', 'title', 'body', 'label', 'row_version', 'created_at', 'updated_at'] as const

const stateProblemCodes: ReadonlySet<string> = new Set(['stale_data_epoch', 'idempotency_key_reused', 'write_fence_active'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * A note is trusted only with the exact contract keys and a non-empty server
 * label; clients display that label and never derive their own.
 */
export function isNote(value: unknown): value is Note {
  return isRecord(value) && hasExactKeys(value, noteKeys) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.notebook_id) &&
    typeof value.title === 'string' &&
    typeof value.body === 'string' &&
    isNonEmptyString(value.label) &&
    isPositiveInteger(value.row_version) &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at)
}

export function isNoteListResult(value: unknown): value is NoteListResult {
  return isRecord(value) && hasExactKeys(value, ['notes']) && Array.isArray(value.notes) &&
    (value.notes as unknown[]).every(isNote)
}

export function isNoteMutationResult(value: unknown): value is NoteMutationResult {
  return isRecord(value) && hasExactKeys(value, ['note', 'account_revision', 'data_epoch']) &&
    isNote(value.note) &&
    isNonNegativeInteger(value.account_revision) &&
    isPositiveInteger(value.data_epoch)
}

function parseStateProblem(value: unknown): StateProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['message', 'code']) ||
    typeof value.message !== 'string' || typeof value.code !== 'string' || !stateProblemCodes.has(value.code)) {
    return undefined
  }
  return { message: value.message, code: value.code as StateProblemDetails['code'] }
}

function parseContentProblem(value: unknown): NoteContentProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['message', 'code']) ||
    typeof value.message !== 'string' || value.code !== 'note_empty') {
    return undefined
  }
  return { message: value.message, code: 'note_empty' }
}

function parseConflictProblem(value: unknown): NoteConflictProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['message', 'code', 'resource_id', 'current_version', 'current_snapshot']) ||
    value.code !== 'version_conflict' || typeof value.message !== 'string' ||
    !isNonEmptyString(value.resource_id) || !isPositiveInteger(value.current_version) ||
    !isNote(value.current_snapshot) ||
    value.current_snapshot.id !== value.resource_id ||
    value.current_snapshot.row_version !== value.current_version) {
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

export function parseNoteUpdateProblem(value: unknown): NoteUpdateProblemDetails | undefined {
  return parseStateProblem(value) ?? parseConflictProblem(value)
}

function parseValidationError(value: unknown): ValidationError | undefined {
  if (!isRecord(value) || typeof value.message !== 'string' || !isRecord(value.errors)) return undefined
  const errors: Record<string, string[]> = {}
  for (const [field, messages] of Object.entries(value.errors)) {
    if (!Array.isArray(messages) || !messages.every((message) => typeof message === 'string')) return undefined
    errors[field] = messages
  }
  return { message: value.message, errors }
}

export class NoteApiError<TProblem extends NoteProblemDetails = NoteProblemDetails> extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problem?: TProblem,
    readonly validation?: ValidationError,
  ) {
    super(message)
    this.name = 'NoteApiError'
  }
}

interface ProblemParsers<TProblem extends NoteProblemDetails> {
  /** Parses a 409 or 423 problem body. */
  state?: (value: unknown) => TProblem | undefined
  /** Parses a 422 problem body that is not a field validation error. */
  unprocessable?: (value: unknown) => TProblem | undefined
}

async function request<T, TProblem extends NoteProblemDetails>(
  path: string,
  guard: (value: unknown) => value is T,
  init?: RequestInit,
  parsers: ProblemParsers<TProblem> = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' }
  if (init?.body) headers['Content-Type'] = 'application/json'
  const token = xsrfToken()
  if (token && init?.method && init.method !== 'GET') headers['X-XSRF-TOKEN'] = token

  const response = await fetch(path, { credentials: 'same-origin', ...init, headers })

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }

  if (response.ok) {
    // An acknowledgement that does not match the contract is never reported as saved.
    if (!guard(body)) {
      throw new NoteApiError<TProblem>('Phản hồi ghi chú không khớp hợp đồng API.', response.status)
    }
    return body
  }

  if (response.status === 422) {
    const problem = parsers.unprocessable?.(body)
    if (problem) throw new NoteApiError<TProblem>(problem.message, 422, problem)
    const validation = parseValidationError(body)
    throw new NoteApiError<TProblem>(validation?.message ?? 'Dữ liệu không hợp lệ.', 422, undefined, validation)
  }

  const problem = (response.status === 409 || response.status === 423) ? parsers.state?.(body) : undefined
  const fallback = isRecord(body) && typeof body.message === 'string'
    ? body.message
    : `Note request failed with status ${response.status}`
  throw new NoteApiError<TProblem>(problem?.message ?? fallback, response.status, problem)
}

/** Notes of one notebook, most recently updated first. A failed load is an error, never an empty list. */
export async function getNotebookNotes(notebookId: string): Promise<NoteListResult> {
  return request<NoteListResult, never>(`/api/v1/notebooks/${encodeURIComponent(notebookId)}/notes`, isNoteListResult)
}

/** Creates a note; the server refuses a blank title and body with note_empty. */
export async function createNote(payload: CreateNoteRequest): Promise<NoteMutationResult> {
  return request<NoteMutationResult, NoteCreateProblemDetails>('/api/v1/notes', isNoteMutationResult, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { state: parseStateProblem, unprocessable: parseContentProblem })
}

/** Replaces title and body at base_version; a stale version carries the current note. */
export async function updateNote(id: string, payload: UpdateNoteRequest): Promise<NoteMutationResult> {
  return request<NoteMutationResult, NoteUpdateProblemDetails>(`/api/v1/notes/${encodeURIComponent(id)}`, isNoteMutationResult, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { state: parseNoteUpdateProblem })
}
