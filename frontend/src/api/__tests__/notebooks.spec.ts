import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  createNotebook,
  deleteNotebook,
  getNotebooks,
  NotebookApiError,
  renameNotebook,
  type Notebook,
} from '../notebooks'

const defaultNotebook: Notebook = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ghi chú nhanh',
  is_default: true,
  row_version: 1,
  note_count: 2,
  created_at: '2026-11-08T10:00:00+00:00',
  updated_at: '2026-11-08T10:00:00+00:00',
}

const workNotebook: Notebook = {
  ...defaultNotebook,
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Công việc',
  is_default: false,
  note_count: 0,
}

function jsonResponse(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } })
}

function stubFetch(response: Response) {
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

async function rejection(promise: Promise<unknown>): Promise<NotebookApiError> {
  const error: unknown = await promise.then(() => undefined, (reason: unknown) => reason)
  expect(error).toBeInstanceOf(NotebookApiError)
  return error as NotebookApiError
}

beforeEach(() => {
  vi.restoreAllMocks()
  document.cookie = 'XSRF-TOKEN=test-csrf-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
})

test('getNotebooks reads the same-origin list with the default notebook first', async () => {
  const fetchSpy = stubFetch(jsonResponse({ notebooks: [defaultNotebook, workNotebook] }))

  const result = await getNotebooks()

  expect(result.notebooks.map((notebook) => notebook.name)).toEqual(['Ghi chú nhanh', 'Công việc'])
  expect(result.notebooks[0]!.is_default).toBe(true)
  const [path, init] = fetchSpy.mock.calls[0]!
  expect(path).toBe('/api/v1/notebooks')
  expect(init).toMatchObject({ credentials: 'same-origin' })
  expect(init?.headers).not.toHaveProperty('X-XSRF-TOKEN')
})

test.each([
  ['no default notebook', { notebooks: [workNotebook] }],
  ['two default notebooks', { notebooks: [defaultNotebook, { ...workNotebook, is_default: true }] }],
  ['the default notebook not first', { notebooks: [workNotebook, defaultNotebook] }],
  ['a nested notebook', { notebooks: [defaultNotebook, { ...workNotebook, parent_id: defaultNotebook.id }] }],
  ['a missing note_count', { notebooks: [{ ...defaultNotebook, note_count: undefined }] }],
  ['an extra top-level key', { notebooks: [defaultNotebook], total: 1 }],
])('getNotebooks rejects a list with %s instead of rendering it', async (_label, body) => {
  stubFetch(jsonResponse(body))

  const error = await rejection(getNotebooks())

  expect(error.status).toBe(200)
  expect(error.problem).toBeUndefined()
})

test('a failed list load is an error, never an empty list', async () => {
  stubFetch(jsonResponse({ message: 'Server Error' }, 500))

  const error = await rejection(getNotebooks())

  expect(error.status).toBe(500)
  expect(error.message).toBe('Server Error')
})

test('createNotebook posts one command with the XSRF token and returns the acknowledgement', async () => {
  const fetchSpy = stubFetch(jsonResponse({ notebook: workNotebook, account_revision: 3, data_epoch: 1 }, 201))
  const payload = { command_id: '11111111-1111-4111-8111-111111111111', data_epoch: 1, name: 'Công việc' }

  const result = await createNotebook(payload)

  expect(result.notebook.id).toBe(workNotebook.id)
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const [path, init] = fetchSpy.mock.calls[0]!
  expect(path).toBe('/api/v1/notebooks')
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toEqual(payload)
  expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-XSRF-TOKEN': 'test-csrf-token' })
})

test('a create acknowledgement with unexpected keys is not treated as saved', async () => {
  stubFetch(jsonResponse({ notebook: { ...workNotebook, parent_id: null }, account_revision: 3, data_epoch: 1 }, 201))

  const error = await rejection(createNotebook({ command_id: '11111111-1111-4111-8111-111111111111', data_epoch: 1, name: 'X' }))

  expect(error.status).toBe(201)
})

test('a 422 keeps the field errors for the form', async () => {
  stubFetch(jsonResponse({ message: 'Validation failed', errors: { name: ['Tên vở không được để trống và tối đa 255 ký tự.'] } }, 422))

  const error = await rejection(createNotebook({ command_id: '11111111-1111-4111-8111-111111111111', data_epoch: 1, name: ' ' }))

  expect(error.status).toBe(422)
  expect(error.validation?.errors.name).toEqual(['Tên vở không được để trống và tối đa 255 ký tự.'])
})

test.each([
  ['stale_data_epoch', 409],
  ['idempotency_key_reused', 409],
  ['write_fence_active', 423],
] as const)('createNotebook exposes the %s state problem', async (code, status) => {
  stubFetch(jsonResponse({ message: 'Problem', code }, status, 'application/problem+json'))

  const error = await rejection(createNotebook({ command_id: '11111111-1111-4111-8111-111111111111', data_epoch: 1, name: 'X' }))

  expect(error.status).toBe(status)
  expect(error.problem).toEqual({ message: 'Problem', code })
})

test('renameNotebook patches the item and a version conflict carries the current snapshot', async () => {
  const current = { ...workNotebook, name: 'Tên mới', row_version: 2 }
  const fetchSpy = stubFetch(jsonResponse({
    message: 'Conflict', code: 'version_conflict', resource_id: workNotebook.id, current_version: 2, current_snapshot: current,
  }, 409, 'application/problem+json'))

  const error = await rejection(renameNotebook(workNotebook.id, {
    command_id: '22222222-2222-4222-8222-222222222222', data_epoch: 1, base_version: 1, name: 'Cũ',
  }))

  const [path, init] = fetchSpy.mock.calls[0]!
  expect(path).toBe(`/api/v1/notebooks/${workNotebook.id}`)
  expect(init?.method).toBe('PATCH')
  expect(error.problem).toEqual({
    message: 'Conflict', code: 'version_conflict', resource_id: workNotebook.id, current_version: 2, current_snapshot: current,
  })
})

test('a conflict whose snapshot does not match its version is not trusted', async () => {
  stubFetch(jsonResponse({
    message: 'Conflict', code: 'version_conflict', resource_id: workNotebook.id, current_version: 3, current_snapshot: workNotebook,
  }, 409, 'application/problem+json'))

  const error = await rejection(renameNotebook(workNotebook.id, {
    command_id: '22222222-2222-4222-8222-222222222222', data_epoch: 1, base_version: 1, name: 'Cũ',
  }))

  expect(error.status).toBe(409)
  expect(error.problem).toBeUndefined()
})

test('rename never accepts a delete-only rule code', async () => {
  stubFetch(jsonResponse({ message: 'No', code: 'notebook_is_default' }, 409, 'application/problem+json'))

  const error = await rejection(renameNotebook(defaultNotebook.id, {
    command_id: '22222222-2222-4222-8222-222222222222', data_epoch: 1, base_version: 1, name: 'X',
  }))

  expect(error.problem).toBeUndefined()
})

test('deleteNotebook sends the command in the body and returns the deletion acknowledgement', async () => {
  const fetchSpy = stubFetch(jsonResponse({ deleted_notebook_id: workNotebook.id, account_revision: 4, data_epoch: 1 }))
  const payload = { command_id: '33333333-3333-4333-8333-333333333333', data_epoch: 1, base_version: 1 }

  const result = await deleteNotebook(workNotebook.id, payload)

  expect(result).toEqual({ deleted_notebook_id: workNotebook.id, account_revision: 4, data_epoch: 1 })
  const [path, init] = fetchSpy.mock.calls[0]!
  expect(path).toBe(`/api/v1/notebooks/${workNotebook.id}`)
  expect(init?.method).toBe('DELETE')
  expect(JSON.parse(init?.body as string)).toEqual(payload)
  expect(init?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'test-csrf-token' })
})

test.each(['notebook_is_default', 'notebook_not_empty'] as const)('deleteNotebook exposes the %s refusal', async (code) => {
  stubFetch(jsonResponse({ message: 'Không thể xóa', code }, 409, 'application/problem+json'))

  const error = await rejection(deleteNotebook(workNotebook.id, {
    command_id: '33333333-3333-4333-8333-333333333333', data_epoch: 1, base_version: 1,
  }))

  expect(error.problem).toEqual({ message: 'Không thể xóa', code })
  expect(error.message).toBe('Không thể xóa')
})

test('deleteNotebook rejects an unknown refusal code and a 404 without a problem', async () => {
  stubFetch(jsonResponse({ message: 'Locked', code: 'notebook_locked' }, 409, 'application/problem+json'))
  expect((await rejection(deleteNotebook(workNotebook.id, {
    command_id: '33333333-3333-4333-8333-333333333333', data_epoch: 1, base_version: 1,
  }))).problem).toBeUndefined()

  stubFetch(jsonResponse({ message: 'Notebook not found' }, 404))
  const notFound = await rejection(deleteNotebook(workNotebook.id, {
    command_id: '33333333-3333-4333-8333-333333333333', data_epoch: 1, base_version: 1,
  }))
  expect(notFound.status).toBe(404)
  expect(notFound.problem).toBeUndefined()
})
