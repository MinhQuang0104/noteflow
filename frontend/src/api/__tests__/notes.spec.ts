import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  createNote,
  getNotebookNotes,
  NoteApiError,
  updateNote,
  type Note,
} from '../notes'

const notebookId = '00000000-0000-4000-8000-000000000001'

const bodyOnlyNote: Note = {
  id: '00000000-0000-4000-8000-0000000000a1',
  notebook_id: notebookId,
  title: '',
  body: '\nMua sữa\r\nMua bánh',
  label: 'Mua sữa',
  row_version: 1,
  created_at: '2026-11-14T10:00:00+00:00',
  updated_at: '2026-11-14T10:00:00+00:00',
}

const titledNote: Note = {
  ...bodyOnlyNote,
  id: '00000000-0000-4000-8000-0000000000a2',
  title: 'Kế hoạch',
  body: '',
  label: 'Kế hoạch',
  updated_at: '2026-11-14T09:00:00+00:00',
}

const createPayload = {
  command_id: '11111111-1111-4111-8111-111111111111',
  data_epoch: 1,
  notebook_id: notebookId,
  title: '',
  body: '\nMua sữa\r\nMua bánh',
}

const updatePayload = {
  command_id: '22222222-2222-4222-8222-222222222222',
  data_epoch: 1,
  base_version: 1,
  title: 'Kế hoạch mới',
  body: '',
}

function jsonResponse(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } })
}

function stubFetch(response: Response) {
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

async function rejection(promise: Promise<unknown>): Promise<NoteApiError> {
  const error: unknown = await promise.then(() => undefined, (reason: unknown) => reason)
  expect(error).toBeInstanceOf(NoteApiError)
  return error as NoteApiError
}

beforeEach(() => {
  vi.restoreAllMocks()
  document.cookie = 'XSRF-TOKEN=test-csrf-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
})

test('getNotebookNotes reads the same-origin note list of one notebook with the server label', async () => {
  const fetchSpy = stubFetch(jsonResponse({ notes: [bodyOnlyNote, titledNote] }))

  const result = await getNotebookNotes(notebookId)

  expect(result.notes.map((note) => note.label)).toEqual(['Mua sữa', 'Kế hoạch'])
  const [path, init] = fetchSpy.mock.calls[0]!
  expect(path).toBe(`/api/v1/notebooks/${notebookId}/notes`)
  expect(init).toMatchObject({ credentials: 'same-origin' })
  expect(init?.headers).not.toHaveProperty('X-XSRF-TOKEN')
})

test('an empty list is returned only from a successful load', async () => {
  stubFetch(jsonResponse({ notes: [] }))
  expect((await getNotebookNotes(notebookId)).notes).toEqual([])

  stubFetch(jsonResponse({ message: 'Server Error' }, 500))
  const error = await rejection(getNotebookNotes(notebookId))
  expect(error.status).toBe(500)
  expect(error.message).toBe('Server Error')

  stubFetch(jsonResponse({ message: 'Notebook not found' }, 404))
  expect((await rejection(getNotebookNotes(notebookId))).status).toBe(404)
})

test.each([
  ['a missing label', { notes: [{ ...bodyOnlyNote, label: undefined }] }],
  ['an empty label', { notes: [{ ...bodyOnlyNote, label: '' }] }],
  ['an unknown note key', { notes: [{ ...bodyOnlyNote, excerpt: 'Mua' }] }],
  ['a non-string body', { notes: [{ ...bodyOnlyNote, body: null }] }],
  ['a zero row_version', { notes: [{ ...bodyOnlyNote, row_version: 0 }] }],
  ['an extra top-level key', { notes: [bodyOnlyNote], total: 1 }],
])('getNotebookNotes rejects a list with %s instead of rendering it', async (_label, body) => {
  stubFetch(jsonResponse(body))

  const error = await rejection(getNotebookNotes(notebookId))

  expect(error.status).toBe(200)
  expect(error.problem).toBeUndefined()
})

test('createNote posts one command with the XSRF token and the text exactly as typed', async () => {
  const fetchSpy = stubFetch(jsonResponse({ note: bodyOnlyNote, account_revision: 3, data_epoch: 1 }, 201))

  const result = await createNote(createPayload)

  expect(result.note.label).toBe('Mua sữa')
  expect(result.note.title).toBe('')
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const [path, init] = fetchSpy.mock.calls[0]!
  expect(path).toBe('/api/v1/notes')
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toEqual(createPayload)
  expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-XSRF-TOKEN': 'test-csrf-token' })
})

test('an acknowledgement that does not match the contract is not treated as saved', async () => {
  stubFetch(jsonResponse({ note: { ...bodyOnlyNote, label: undefined }, account_revision: 3, data_epoch: 1 }, 201))
  expect((await rejection(createNote(createPayload))).status).toBe(201)

  stubFetch(jsonResponse({ note: titledNote, account_revision: 3 }))
  expect((await rejection(updateNote(titledNote.id, updatePayload))).status).toBe(200)
})

test('a create refused with note_empty exposes the problem, not a field error', async () => {
  stubFetch(jsonResponse({ message: 'Note cần có tiêu đề hoặc nội dung.', code: 'note_empty' }, 422, 'application/problem+json'))

  const error = await rejection(createNote({ ...createPayload, title: ' ', body: '' }))

  expect(error.status).toBe(422)
  expect(error.problem).toEqual({ message: 'Note cần có tiêu đề hoặc nội dung.', code: 'note_empty' })
  expect(error.validation).toBeUndefined()
  expect(error.message).toBe('Note cần có tiêu đề hoặc nội dung.')
})

test('a 422 field error keeps the title and body errors for the editor', async () => {
  stubFetch(jsonResponse({ message: 'Validation failed', errors: { title: ['Tiêu đề tối đa 255 ký tự.'] } }, 422))

  const error = await rejection(createNote({ ...createPayload, title: 'a'.repeat(256) }))

  expect(error.status).toBe(422)
  expect(error.problem).toBeUndefined()
  expect(error.validation?.errors.title).toEqual(['Tiêu đề tối đa 255 ký tự.'])
})

test.each([
  ['stale_data_epoch', 409],
  ['idempotency_key_reused', 409],
  ['write_fence_active', 423],
] as const)('createNote and updateNote expose the %s state problem', async (code, status) => {
  stubFetch(jsonResponse({ message: 'Problem', code }, status, 'application/problem+json'))
  const created = await rejection(createNote(createPayload))
  expect(created.status).toBe(status)
  expect(created.problem).toEqual({ message: 'Problem', code })

  stubFetch(jsonResponse({ message: 'Problem', code }, status, 'application/problem+json'))
  const updated = await rejection(updateNote(titledNote.id, updatePayload))
  expect(updated.problem).toEqual({ message: 'Problem', code })
})

test('updateNote patches the note with base_version and returns the new version', async () => {
  const saved = { ...titledNote, title: 'Kế hoạch mới', label: 'Kế hoạch mới', row_version: 2 }
  const fetchSpy = stubFetch(jsonResponse({ note: saved, account_revision: 4, data_epoch: 1 }))

  const result = await updateNote(titledNote.id, updatePayload)

  expect(result.note.row_version).toBe(2)
  const [path, init] = fetchSpy.mock.calls[0]!
  expect(path).toBe(`/api/v1/notes/${titledNote.id}`)
  expect(init?.method).toBe('PATCH')
  expect(JSON.parse(init?.body as string)).toEqual(updatePayload)
  expect(init?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'test-csrf-token' })
})

test('a version conflict carries the current note snapshot with its label', async () => {
  const current = { ...titledNote, body: 'Từ thiết bị khác', row_version: 2 }
  stubFetch(jsonResponse({
    message: 'Conflict', code: 'version_conflict', resource_id: titledNote.id, current_version: 2, current_snapshot: current,
  }, 409, 'application/problem+json'))

  const error = await rejection(updateNote(titledNote.id, updatePayload))

  expect(error.problem).toEqual({
    message: 'Conflict', code: 'version_conflict', resource_id: titledNote.id, current_version: 2, current_snapshot: current,
  })
})

test.each([
  ['a snapshot that does not match its version', { current_version: 3, current_snapshot: titledNote }],
  ['a snapshot of another note', { current_version: 1, current_snapshot: bodyOnlyNote }],
  ['a snapshot without a label', { current_version: 1, current_snapshot: { ...titledNote, label: undefined } }],
])('a conflict with %s is not trusted', async (_label, fields) => {
  stubFetch(jsonResponse({
    message: 'Conflict', code: 'version_conflict', resource_id: titledNote.id, ...fields,
  }, 409, 'application/problem+json'))

  const error = await rejection(updateNote(titledNote.id, updatePayload))

  expect(error.status).toBe(409)
  expect(error.problem).toBeUndefined()
})

test('create never accepts a version conflict and update never accepts note_empty', async () => {
  stubFetch(jsonResponse({
    message: 'Conflict', code: 'version_conflict', resource_id: titledNote.id, current_version: 1, current_snapshot: titledNote,
  }, 409, 'application/problem+json'))
  expect((await rejection(createNote(createPayload))).problem).toBeUndefined()

  stubFetch(jsonResponse({ message: 'Rỗng', code: 'note_empty' }, 422, 'application/problem+json'))
  const updated = await rejection(updateNote(titledNote.id, updatePayload))
  expect(updated.problem).toBeUndefined()
  expect(updated.status).toBe(422)

  stubFetch(jsonResponse({ message: 'Note not found' }, 404))
  const notFound = await rejection(updateNote(titledNote.id, updatePayload))
  expect(notFound.status).toBe(404)
  expect(notFound.problem).toBeUndefined()
})
