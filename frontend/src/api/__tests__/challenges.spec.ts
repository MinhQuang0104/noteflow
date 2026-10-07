import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  createChallenge,
  getChallenge,
  getChallenges,
  getChallengeJournal,
  saveChallengeJournal,
  updateChallengeMetadata,
  ChallengeApiError,
  type JournalSnapshot,
  type JournalProblemDetails,
} from '../challenges'

beforeEach(() => {
  vi.restoreAllMocks()
  document.cookie = 'XSRF-TOKEN=test-csrf-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
})

test('getChallenges requests /api/v1/challenges with credentials and returns list', async () => {
  const mockChallenges = [
    {
      id: 'd9b9b5a8-2026-4444-9999-000000000001',
      name: 'Đọc sách mỗi ngày',
      description: 'Đọc ít nhất 30 phút',
      start_date: '2026-09-19',
      target_days: 5,
      row_version: 1,
      created_at: '2026-09-19T10:00:00Z',
      updated_at: '2026-09-19T10:00:00Z',
    },
  ]

  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ challenges: mockChallenges }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchSpy)

  const result = await getChallenges()
  expect(result.challenges).toHaveLength(1)
  expect(result.challenges[0]!.name).toBe('Đọc sách mỗi ngày')
  expect(fetchSpy).toHaveBeenCalledWith('/api/v1/challenges', expect.objectContaining({
    credentials: 'same-origin',
    headers: expect.objectContaining({ Accept: 'application/json, application/problem+json' }),
  }))
})

test('getChallenge requests /api/v1/challenges/:id', async () => {
  const challengeId = 'd9b9b5a8-2026-4444-9999-000000000001'
  const mockChallenge = {
    id: challengeId,
    name: 'Tập thể dục',
    description: null,
    start_date: '2026-09-19',
    target_days: 4,
    row_version: 2,
    created_at: '2026-09-19T10:00:00Z',
    updated_at: '2026-09-19T10:00:00Z',
  }

  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ challenge: mockChallenge }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchSpy)

  const result = await getChallenge(challengeId)
  expect(result.challenge.id).toBe(challengeId)
  expect(fetchSpy).toHaveBeenCalledWith(
    `/api/v1/challenges/${challengeId}`,
    expect.objectContaining({
      credentials: 'same-origin',
      headers: expect.objectContaining({ Accept: 'application/json, application/problem+json' }),
    }),
  )
})

test('createChallenge sends POST with XSRF token and body', async () => {
  const payload = {
    command_id: 'cmd-create-1',
    data_epoch: 1,
    name: 'Chạy bộ',
    description: 'Chạy 5km',
    target_days: 3,
  }

  const mockResponse = {
    challenge: {
      id: 'new-id',
      name: 'Chạy bộ',
      description: 'Chạy 5km',
      start_date: '2026-09-19',
      target_days: 3,
      row_version: 1,
      created_at: '2026-09-19T10:00:00Z',
      updated_at: '2026-09-19T10:00:00Z',
    },
    account_revision: 5,
    data_epoch: 1,
  }

  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(mockResponse), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchSpy)

  const result = await createChallenge(payload)
  expect(result.challenge.name).toBe('Chạy bộ')
  expect(result.account_revision).toBe(5)
  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/v1/challenges',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: expect.objectContaining({
        Accept: 'application/json, application/problem+json',
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': 'test-csrf-token',
      }),
      body: JSON.stringify(payload),
    }),
  )
})

test('updateChallengeMetadata sends PATCH with base_version', async () => {
  const challengeId = 'd9b9b5a8-2026-4444-9999-000000000001'
  const payload = {
    command_id: 'cmd-update-1',
    data_epoch: 1,
    base_version: 1,
    name: 'Chạy bộ buổi sáng',
    description: 'Chạy 6km',
  }

  const mockResponse = {
    challenge: {
      id: challengeId,
      name: 'Chạy bộ buổi sáng',
      description: 'Chạy 6km',
      start_date: '2026-09-19',
      target_days: 3,
      row_version: 2,
      created_at: '2026-09-19T10:00:00Z',
      updated_at: '2026-09-19T10:00:00Z',
    },
    account_revision: 6,
    data_epoch: 1,
  }

  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchSpy)

  const result = await updateChallengeMetadata(challengeId, payload)
  expect(result.challenge.row_version).toBe(2)
  expect(fetchSpy).toHaveBeenCalledWith(
    `/api/v1/challenges/${challengeId}`,
    expect.objectContaining({
      method: 'PATCH',
      credentials: 'same-origin',
      headers: expect.objectContaining({
        Accept: 'application/json, application/problem+json',
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': 'test-csrf-token',
      }),
      body: JSON.stringify(payload),
    }),
  )
})

test('createChallenge throws ChallengeApiError with validation errors on 422', async () => {
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        message: 'Dữ liệu không hợp lệ.',
        errors: { target_days: ['Mục tiêu số ngày phải từ 1 đến 7.'] },
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    ),
  )
  vi.stubGlobal('fetch', fetchSpy)

  await expect(
    createChallenge({
      command_id: 'cmd-1',
      data_epoch: 1,
      name: 'Test',
      target_days: 9,
    }),
  ).rejects.toThrow(ChallengeApiError)
})

test('updateChallengeMetadata throws ChallengeApiError with problem details on 409 conflict', async () => {
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        message: 'Bản ghi đã được sửa đổi bởi thao tác khác.',
        code: 'version_conflict',
        resource_id: 'res-1',
        current_version: 3,
        current_snapshot: {
          id: 'res-1',
          name: 'Tên mới từ máy khác',
          description: '',
          start_date: '2026-09-19',
          target_days: 5,
          row_version: 3,
        },
      }),
      { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  )
  vi.stubGlobal('fetch', fetchSpy)

  await expect(
    updateChallengeMetadata('res-1', {
      command_id: 'cmd-1',
      data_epoch: 1,
      base_version: 1,
      name: 'Tên xung đột',
    }),
  ).rejects.toMatchObject({
    name: 'ChallengeApiError',
    status: 409,
    problem: {
      code: 'version_conflict',
      resource_id: 'res-1',
      current_version: 3,
    },
  })
})

test('updateChallengeMetadata rejects a journal-shaped conflict at the API boundary', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({
      message: 'Version conflict',
      code: 'version_conflict',
      resource_id: 'challenge-1',
      current_version: 2,
      current_snapshot: {
        challenge_id: 'challenge-1',
        local_date: '2026-09-19',
        journal: 'Saved text',
        journal_version: 2,
      },
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }),
  ))

  const error = await updateChallengeMetadata('challenge-1', {
    command_id: 'command-wrong-family',
    data_epoch: 1,
    base_version: 1,
    name: 'Challenge',
  }).then(() => null, (reason: ChallengeApiError) => reason)

  expect(error).toMatchObject({ status: 409, message: 'Version conflict' })
  expect(error?.problem).toBeUndefined()
})

test('challenge mutations accept a state problem only without resource fields', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({
      message: 'The account data epoch is stale.',
      code: 'stale_data_epoch',
    }), { status: 423, headers: { 'Content-Type': 'application/problem+json' } }),
  ))

  const error = await updateChallengeMetadata('challenge-1', {
    command_id: 'command-state-problem',
    data_epoch: 1,
    base_version: 1,
    name: 'Challenge',
  }).then(() => null, (reason: ChallengeApiError) => reason)

  expect(error).toMatchObject({
    status: 423,
    problem: { code: 'stale_data_epoch' },
  })
})

test('getChallengeJournal reads an absent journal and version zero for the requested day', async () => {
  const journal = {
    challenge_id: 'challenge-1',
    local_date: '2026-09-19',
    journal: null,
    journal_version: 0,
  }
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ journal }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchSpy)

  await expect(getChallengeJournal('challenge-1', '2026-09-19')).resolves.toEqual({ journal })
  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/v1/challenges/challenge-1/journals/2026-09-19',
    expect.objectContaining({
      credentials: 'same-origin',
      headers: expect.objectContaining({ Accept: 'application/json, application/problem+json' }),
    }),
  )
})

test('saveChallengeJournal sends the supplied version, epoch, command and text without completion fields', async () => {
  const payload = {
    command_id: 'command-1',
    data_epoch: 4,
    base_version: 0,
    journal: 'A private note',
  }
  const result = {
    journal: {
      challenge_id: 'challenge-1',
      local_date: '2026-09-19',
      journal: 'A private note',
      journal_version: 1,
    },
    account_revision: 8,
    data_epoch: 4,
  }
  const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(result), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchSpy)

  await expect(saveChallengeJournal('challenge-1', '2026-09-19', payload)).resolves.toEqual(result)
  expect(fetchSpy).toHaveBeenCalledWith(
    '/api/v1/challenges/challenge-1/journals/2026-09-19',
    expect.objectContaining({
      method: 'PUT',
      credentials: 'same-origin',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-XSRF-TOKEN': 'test-csrf-token',
      }),
      body: JSON.stringify(payload),
    }),
  )
})

test('saveChallengeJournal exposes stale journal version and snapshot without echoing submitted text in the error', async () => {
  const snapshot = {
    challenge_id: 'challenge-1',
    local_date: '2026-09-19',
    journal: 'Saved text',
    journal_version: 2,
  }
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({
      message: 'Version conflict',
      code: 'version_conflict',
      resource_id: 'challenge-1',
      current_version: 2,
      current_snapshot: snapshot,
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }),
  ))

  const error = await saveChallengeJournal('challenge-1', '2026-09-19', {
    command_id: 'command-2',
    data_epoch: 4,
    base_version: 1,
    journal: 'Unsubmitted text',
  }).then(() => null, (reason: ChallengeApiError<JournalProblemDetails>) => reason)

  expect(error).toMatchObject({
    name: 'ChallengeApiError',
    status: 409,
    message: 'Version conflict',
    problem: { code: 'version_conflict', current_version: 2, current_snapshot: snapshot },
  })
  expect(error?.message).not.toContain('Unsubmitted text')
  const current = error?.problem?.code === 'version_conflict'
    ? error.problem.current_snapshot
    : undefined
  if (!current || !('journal_version' in current)) throw new Error('Journal conflict snapshot missing')
  const journalSnapshot: JournalSnapshot = current
  expect(journalSnapshot.journal_version).toBe(2)
})

test('saveChallengeJournal rejects a malformed journal conflict snapshot at the API boundary', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({
      message: 'Version conflict',
      code: 'version_conflict',
      resource_id: 'challenge-1',
      current_version: 2,
      current_snapshot: {
        challenge_id: 'challenge-1',
        local_date: '2026-09-19',
        journal: 'Saved text',
      },
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }),
  ))

  const error = await saveChallengeJournal('challenge-1', '2026-09-19', {
    command_id: 'command-malformed',
    data_epoch: 4,
    base_version: 1,
    journal: 'Unsubmitted text',
  }).then(() => null, (reason: ChallengeApiError<JournalProblemDetails>) => reason)

  expect(error).toMatchObject({ status: 409, message: 'Version conflict' })
  expect(error?.problem).toBeUndefined()
})

test('saveChallengeJournal rejects a journal conflict when current_version disagrees with the snapshot version', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({
      message: 'Version conflict',
      code: 'version_conflict',
      resource_id: 'challenge-1',
      current_version: 3,
      current_snapshot: {
        challenge_id: 'challenge-1',
        local_date: '2026-09-19',
        journal: 'Saved text',
        journal_version: 2,
      },
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }),
  ))

  const error = await saveChallengeJournal('challenge-1', '2026-09-19', {
    command_id: 'command-mismatch',
    data_epoch: 4,
    base_version: 1,
    journal: 'Unsubmitted text',
  }).then(() => null, (reason: ChallengeApiError<JournalProblemDetails>) => reason)

  expect(error).toMatchObject({ status: 409, message: 'Version conflict' })
  expect(error?.problem).toBeUndefined()
})
