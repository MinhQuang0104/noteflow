import { expect, test } from '@playwright/test'

test.describe('Story 4.2 — Tạo quick note với title tùy chọn', () => {
  const defaultNotebook = {
    id: 'nb-default-001',
    name: 'Ghi chú nhanh',
    is_default: true,
    row_version: 1,
    note_count: 0,
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-01T08:00:00Z',
  }

  const regularNotebook = {
    id: 'nb-regular-002',
    name: 'Sổ tay nghiên cứu',
    is_default: false,
    row_version: 1,
    note_count: 0,
    created_at: '2026-11-02T08:00:00Z',
    updated_at: '2026-11-02T08:00:00Z',
  }

  test.beforeEach(async ({ page }) => {
    // Authenticated session mock
    await page.route('**/api/v1/session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ owner: { id: 1, name: 'NoteFlow Owner', email: 'owner@example.test' } }),
      }),
    )

    // Account context mock
    await page.route('**/api/v1/account', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({
          timezone: 'Asia/Ho_Chi_Minh',
          account_date: '2026-11-14',
          week: { start_date: '2026-11-09', end_date: '2026-11-15' },
          account_revision: 1,
          data_epoch: 1,
          write_state: 'open',
        }),
      }),
    )

    // Notebooks list mock
    await page.route('**/api/v1/notebooks', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'private, no-store' },
          body: JSON.stringify({ notebooks: [defaultNotebook, regularNotebook] }),
        })
      }
      return route.fallback()
    })

    // Challenges list mock for Today
    await page.route('**/api/v1/challenges', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ challenges: [] }),
      }),
    )
  })

  test('AC-1: Today entry opens new editor in default notebook with body focused', async ({ page }) => {
    await page.route('**/api/v1/notebooks/*/notes', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ notes: [] }),
      }),
    )

    await page.goto('/today')

    // Today view has "Ghi chú mới" entry in header
    const newNoteBtn = page.getByTestId('today-new-note-button')
    await expect(newNoteBtn).toBeVisible()
    await expect(newNoteBtn).toHaveText('Ghi chú mới')

    // Click "Ghi chú mới"
    await newNoteBtn.click()

    // Navigates to Notes workspace and consumes ?new=1
    await expect(page).toHaveURL(/\/notes$/)

    // Default notebook is selected
    await expect(page.getByTestId('selected-notebook-title')).toHaveText('Ghi chú nhanh')

    // New editor is open with empty title and body
    const titleInput = page.getByTestId('note-title-input')
    const bodyInput = page.getByTestId('note-body-input')
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toHaveValue('')
    await expect(bodyInput).toBeVisible()
    await expect(bodyInput).toHaveValue('')

    // Body input has focus
    await expect(bodyInput).toBeFocused()
  })

  test('AC-4: body-only note is saved and labelled by its first body line without writing to title', async ({
    page,
  }) => {
    let currentNotes: Array<Record<string, unknown>> = []
    let createCalled = false

    const createdNote = {
      id: 'note-body-only-1',
      notebook_id: defaultNotebook.id,
      title: '',
      body: 'Dòng đầu tiên của ghi chú\nDòng thứ hai tiếp theo',
      label: 'Dòng đầu tiên của ghi chú',
      row_version: 1,
      created_at: '2026-11-14T09:00:00Z',
      updated_at: '2026-11-14T09:00:00Z',
    }

    await page.route('**/api/v1/notebooks/*/notes', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ notes: currentNotes }),
      }),
    )

    await page.route('**/api/v1/notes', async (route) => {
      if (route.request().method() === 'POST') {
        createCalled = true
        const payload = JSON.parse(route.request().postData() ?? '{}') as {
          notebook_id: string
          title: string
          body: string
        }
        expect(payload.notebook_id).toBe(defaultNotebook.id)
        expect(payload.title).toBe('')
        expect(payload.body).toBe('Dòng đầu tiên của ghi chú\nDòng thứ hai tiếp theo')

        currentNotes = [createdNote]
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'private, no-store' },
          body: JSON.stringify({
            note: createdNote,
            account_revision: 2,
            data_epoch: 1,
          }),
        })
      }
      return route.fallback()
    })

    await page.goto('/notes?new=1')

    const bodyInput = page.getByTestId('note-body-input')
    await bodyInput.fill('Dòng đầu tiên của ghi chú\nDòng thứ hai tiếp theo')

    // Wait for typing pause autosave to trigger and complete
    await expect(page.getByTestId('note-save-status')).toHaveText('Đã lưu', { timeout: 5000 })
    expect(createCalled).toBe(true)

    // Body value is preserved after save (regression check for F-42B-3)
    await expect(bodyInput).toHaveValue('Dòng đầu tiên của ghi chú\nDòng thứ hai tiếp theo')
    await expect(page).toHaveURL(/\/notes$/)

    // Note list renders server label derived from first non-empty body line
    const noteList = page.getByTestId('note-list')
    await expect(noteList).toBeVisible()
    const noteItem = noteList.getByTestId(`note-label-${createdNote.id}`)
    await expect(noteItem).toHaveText('Dòng đầu tiên của ghi chú')

    // Title input remains empty without writing label back to title
    await expect(page.getByTestId('note-title-input')).toHaveValue('')
  })

  test('AC-4: title-only note is saved and labelled by its title', async ({ page }) => {
    let currentNotes: Array<Record<string, unknown>> = []
    let createCalled = false

    const createdNote = {
      id: 'note-title-only-2',
      notebook_id: defaultNotebook.id,
      title: 'Tiêu đề ghi chú độc lập',
      body: '',
      label: 'Tiêu đề ghi chú độc lập',
      row_version: 1,
      created_at: '2026-11-14T09:10:00Z',
      updated_at: '2026-11-14T09:10:00Z',
    }

    await page.route('**/api/v1/notebooks/*/notes', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ notes: currentNotes }),
      }),
    )

    await page.route('**/api/v1/notes', async (route) => {
      if (route.request().method() === 'POST') {
        createCalled = true
        const payload = JSON.parse(route.request().postData() ?? '{}') as {
          notebook_id: string
          title: string
          body: string
        }
        expect(payload.notebook_id).toBe(defaultNotebook.id)
        expect(payload.title).toBe('Tiêu đề ghi chú độc lập')
        expect(payload.body).toBe('')

        currentNotes = [createdNote]
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'private, no-store' },
          body: JSON.stringify({
            note: createdNote,
            account_revision: 3,
            data_epoch: 1,
          }),
        })
      }
      return route.fallback()
    })

    await page.goto('/notes')

    // Click "+ Ghi chú mới" in Notes workspace
    await page.getByTestId('create-note-button').click()

    // Type title only, body empty
    const titleInput = page.getByTestId('note-title-input')
    await titleInput.fill('Tiêu đề ghi chú độc lập')

    // Wait for typing pause autosave to trigger and complete
    await expect(page.getByTestId('note-save-status')).toHaveText('Đã lưu', { timeout: 5000 })
    expect(createCalled).toBe(true)

    // Note list shows note with label equal to title
    const noteList = page.getByTestId('note-list')
    await expect(noteList).toBeVisible()
    const noteItem = noteList.getByTestId(`note-label-${createdNote.id}`)
    await expect(noteItem).toHaveText('Tiêu đề ghi chú độc lập')
  })

  test('AC-3: leaving an untouched brand-new editor creates nothing', async ({ page }) => {
    let createAttempted = false

    const existingNote = {
      id: 'note-existing-1',
      notebook_id: defaultNotebook.id,
      title: 'Ghi chú có sẵn',
      body: 'Nội dung sẵn có',
      label: 'Ghi chú có sẵn',
      row_version: 1,
      created_at: '2026-11-14T08:00:00Z',
      updated_at: '2026-11-14T08:00:00Z',
    }

    await page.route('**/api/v1/notebooks/*/notes', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ notes: [existingNote] }),
      }),
    )

    await page.route('**/api/v1/notes', async (route) => {
      if (route.request().method() === 'POST') {
        createAttempted = true
        return route.fulfill({ status: 400 })
      }
      return route.fallback()
    })

    await page.goto('/notes')

    // Click "+ Ghi chú mới" to open empty editor
    await page.getByTestId('create-note-button').click()
    const bodyInput = page.getByTestId('note-body-input')
    await expect(bodyInput).toBeVisible()
    await expect(bodyInput).toHaveValue('')

    // Leave without typing: select the existing note in the list
    await page.getByTestId(`note-item-${existingNote.id}`).click()

    // Selected note is now the existing note
    await expect(page.getByTestId('note-title-input')).toHaveValue('Ghi chú có sẵn')

    // No POST /notes request was sent
    expect(createAttempted).toBe(false)
  })
})
