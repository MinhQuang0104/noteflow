import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  createChallenge,
  getChallenge,
  getChallenges,
  updateChallengeMetadata,
  ChallengeApiError,
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
