import { generateCommandId, xsrfToken } from './challenges'
import type { components } from './schema.generated'

export type Notebook = components['schemas']['Notebook']
export type NotebookListResult = components['schemas']['NotebookListResult']
export type NotebookMutationResult = components['schemas']['NotebookMutationResult']
export type NotebookDeletionResult = components['schemas']['NotebookDeletionResult']
export type CreateNotebookRequest = components['schemas']['CreateNotebookRequest']
export type RenameNotebookRequest = components['schemas']['RenameNotebookRequest']
export type DeleteNotebookRequest = components['schemas']['DeleteNotebookRequest']
export type StateProblemDetails = components['schemas']['StateProblemDetails']
export type NotebookConflictProblemDetails = components['schemas']['NotebookConflictProblemDetails']
export type NotebookRuleProblemDetails = components['schemas']['NotebookRuleProblemDetails']
export type NotebookRenameProblemDetails = components['schemas']['NotebookRenameProblemDetails']
export type NotebookDeleteProblemDetails = components['schemas']['NotebookDeleteProblemDetails']
export type NotebookProblemDetails = NotebookDeleteProblemDetails
export type ValidationError = components['schemas']['ValidationError']

export { generateCommandId }

const notebookKeys = ['id', 'name', 'is_default', 'row_version', 'note_count', 'created_at', 'updated_at'] as const

const stateProblemCodes: ReadonlySet<string> = new Set(['stale_data_epoch', 'idempotency_key_reused', 'write_fence_active'])
const ruleProblemCodes: ReadonlySet<string> = new Set(['notebook_is_default', 'notebook_not_empty'])

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

/** A notebook is trusted only with the exact contract keys; there is no parent reference. */
export function isNotebook(value: unknown): value is Notebook {
  return isRecord(value) && hasExactKeys(value, notebookKeys) &&
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' && value.name.trim().length > 0 &&
    typeof value.is_default === 'boolean' &&
    isPositiveInteger(value.row_version) &&
    isNonNegativeInteger(value.note_count) &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at)
}

/** The list must contain exactly one default notebook and it must come first. */
export function isNotebookListResult(value: unknown): value is NotebookListResult {
  if (!isRecord(value) || !hasExactKeys(value, ['notebooks']) || !Array.isArray(value.notebooks)) return false
  const notebooks: unknown[] = value.notebooks
  if (!notebooks.every(isNotebook)) return false
  const defaults = notebooks.filter((notebook) => notebook.is_default)
  return defaults.length === 1 && notebooks[0] === defaults[0]
}

export function isNotebookMutationResult(value: unknown): value is NotebookMutationResult {
  return isRecord(value) && hasExactKeys(value, ['notebook', 'account_revision', 'data_epoch']) &&
    isNotebook(value.notebook) &&
    isNonNegativeInteger(value.account_revision) &&
    isPositiveInteger(value.data_epoch)
}

export function isNotebookDeletionResult(value: unknown): value is NotebookDeletionResult {
  return isRecord(value) && hasExactKeys(value, ['deleted_notebook_id', 'account_revision', 'data_epoch']) &&
    isNonEmptyString(value.deleted_notebook_id) &&
    isPositiveInteger(value.account_revision) &&
    isPositiveInteger(value.data_epoch)
}

function parseStateProblem(value: unknown): StateProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['message', 'code']) ||
    typeof value.message !== 'string' || typeof value.code !== 'string' || !stateProblemCodes.has(value.code)) {
    return undefined
  }
  return { message: value.message, code: value.code as StateProblemDetails['code'] }
}

function parseRuleProblem(value: unknown): NotebookRuleProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['message', 'code']) ||
    typeof value.message !== 'string' || typeof value.code !== 'string' || !ruleProblemCodes.has(value.code)) {
    return undefined
  }
  return { message: value.message, code: value.code as NotebookRuleProblemDetails['code'] }
}

function parseConflictProblem(value: unknown): NotebookConflictProblemDetails | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['message', 'code', 'resource_id', 'current_version', 'current_snapshot']) ||
    value.code !== 'version_conflict' || typeof value.message !== 'string' ||
    !isNonEmptyString(value.resource_id) || !isPositiveInteger(value.current_version) ||
    !isNotebook(value.current_snapshot) ||
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

export function parseNotebookRenameProblem(value: unknown): NotebookRenameProblemDetails | undefined {
  return parseStateProblem(value) ?? parseConflictProblem(value)
}

export function parseNotebookDeleteProblem(value: unknown): NotebookDeleteProblemDetails | undefined {
  return parseStateProblem(value) ?? parseConflictProblem(value) ?? parseRuleProblem(value)
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

export class NotebookApiError<TProblem extends NotebookProblemDetails = NotebookProblemDetails> extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problem?: TProblem,
    readonly validation?: ValidationError,
  ) {
    super(message)
    this.name = 'NotebookApiError'
  }
}

type ProblemParser<TProblem extends NotebookProblemDetails> = (value: unknown) => TProblem | undefined

async function request<T, TProblem extends NotebookProblemDetails>(
  path: string,
  guard: (value: unknown) => value is T,
  init?: RequestInit,
  problemParser?: ProblemParser<TProblem>,
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
      throw new NotebookApiError<TProblem>('Phản hồi vở không khớp hợp đồng API.', response.status)
    }
    return body
  }

  if (response.status === 422) {
    const validation = parseValidationError(body)
    throw new NotebookApiError<TProblem>(validation?.message ?? 'Dữ liệu không hợp lệ.', 422, undefined, validation)
  }

  const problem = (response.status === 409 || response.status === 423) && problemParser ? problemParser(body) : undefined
  const fallback = isRecord(body) && typeof body.message === 'string'
    ? body.message
    : `Notebook request failed with status ${response.status}`
  throw new NotebookApiError<TProblem>(problem?.message ?? fallback, response.status, problem)
}

function itemPath(id: string): string {
  return `/api/v1/notebooks/${encodeURIComponent(id)}`
}

export async function getNotebooks(): Promise<NotebookListResult> {
  return request<NotebookListResult, never>('/api/v1/notebooks', isNotebookListResult)
}

export async function createNotebook(payload: CreateNotebookRequest): Promise<NotebookMutationResult> {
  return request<NotebookMutationResult, StateProblemDetails>('/api/v1/notebooks', isNotebookMutationResult, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, parseStateProblem)
}

export async function renameNotebook(id: string, payload: RenameNotebookRequest): Promise<NotebookMutationResult> {
  return request<NotebookMutationResult, NotebookRenameProblemDetails>(itemPath(id), isNotebookMutationResult, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, parseNotebookRenameProblem)
}

export async function deleteNotebook(id: string, payload: DeleteNotebookRequest): Promise<NotebookDeletionResult> {
  return request<NotebookDeletionResult, NotebookDeleteProblemDetails>(itemPath(id), isNotebookDeletionResult, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  }, parseNotebookDeleteProblem)
}
