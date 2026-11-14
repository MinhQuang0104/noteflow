import { expect, test } from '@playwright/test'

test.describe('Story 4.1 — Quản lý vở và vở mặc định', () => {
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

  const nonEmptyNotebook = {
    id: 'nb-nonempty-003',
    name: 'Tài liệu dự án',
    is_default: false,
    row_version: 1,
    note_count: 3,
    created_at: '2026-11-03T08:00:00Z',
    updated_at: '2026-11-03T08:00:00Z',
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
  })

  test('AC-1: Given account mới/restore hợp lệ When mở Notes Then có đúng một vở mặc định được gắn nhãn và đứng đầu', async ({
    page,
  }) => {
    // Return notebooks list with default notebook
    await page.route('**/api/v1/notebooks', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ notebooks: [defaultNotebook, regularNotebook] }),
        })
      }
      return route.fallback()
    })

    await page.goto('/notes')

    // Notebook list exists and has one level
    const list = page.getByTestId('notebook-list')
    await expect(list).toBeVisible()

    const items = list.locator(':scope > li')
    await expect(items).toHaveCount(2)

    // First notebook is the default one and has the "Mặc định" badge
    const firstItem = items.first()
    await expect(firstItem).toContainText('Ghi chú nhanh')
    await expect(firstItem.getByTestId('default-badge')).toHaveText('Mặc định')

    // Second notebook does not have the default badge
    const secondItem = items.nth(1)
    await expect(secondItem).toContainText('Sổ tay nghiên cứu')
    await expect(secondItem.getByTestId('default-badge')).toBeHidden()
  })

  test('AC-2: Given tên hợp lệ When tạo/đổi tên vở Then vở xuất hiện đúng một cấp', async ({ page }) => {
    let currentNotebooks = [defaultNotebook]
    const createdNotebook = {
      id: 'nb-new-004',
      name: 'Vở công việc',
      is_default: false,
      row_version: 1,
      note_count: 0,
      created_at: '2026-11-14T08:00:00Z',
      updated_at: '2026-11-14T08:00:00Z',
    }

    await page.route('**/api/v1/notebooks', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ notebooks: currentNotebooks }),
        })
      }
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() ?? '{}') as { name: string }
        expect(payload.name).toBe('Vở công việc')
        currentNotebooks = [...currentNotebooks, createdNotebook]
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            notebook: createdNotebook,
            account_revision: 2,
            data_epoch: 1,
          }),
        })
      }
      return route.fallback()
    })

    await page.route('**/api/v1/notebooks/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        const payload = JSON.parse(route.request().postData() ?? '{}') as { name: string }
        expect(payload.name).toBe('Vở công việc đã đổi tên')
        const renamed = { ...createdNotebook, name: payload.name, row_version: 2 }
        currentNotebooks = currentNotebooks.map((nb) => (nb.id === createdNotebook.id ? renamed : nb))
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            notebook: renamed,
            account_revision: 3,
            data_epoch: 1,
          }),
        })
      }
      return route.fallback()
    })

    await page.goto('/notes')

    // 1. Create a notebook
    await page.getByTestId('create-notebook-button').click()
    const nameInput = page.getByTestId('create-notebook-name-input')
    await nameInput.fill('Vở công việc')
    await page.getByTestId('create-notebook-submit').click()

    // Appears in the one-level list
    const list = page.getByTestId('notebook-list')
    await expect(list.locator(':scope > li')).toHaveCount(2)
    await expect(list).toContainText('Vở công việc')
    expect(await list.locator('ul').count()).toBe(0)

    // 2. Rename the created notebook
    await page.getByTestId(`rename-notebook-button-${createdNotebook.id}`).click()
    const renameInput = page.getByTestId(`rename-notebook-name-input-${createdNotebook.id}`)
    await renameInput.fill('Vở công việc đã đổi tên')
    await page.getByTestId(`rename-notebook-submit-${createdNotebook.id}`).click()

    // Renamed notebook appears with new name in 1-level list
    await expect(list).toContainText('Vở công việc đã đổi tên')
    expect(await list.locator('ul').count()).toBe(0)
  })

  test('AC-3: Given vở mặc định hoặc vở còn note When yêu cầu xóa Then từ chối với lý do/action rõ', async ({
    page,
  }) => {
    let deleteAttempted = false
    await page.route('**/api/v1/notebooks', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ notebooks: [defaultNotebook, nonEmptyNotebook] }),
        })
      }
      return route.fallback()
    })

    await page.route('**/api/v1/notebooks/*', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteAttempted = true
        return route.fulfill({ status: 400 })
      }
      return route.fallback()
    })

    await page.goto('/notes')

    // 1. Attempt delete default notebook
    await page.getByTestId(`delete-notebook-button-${defaultNotebook.id}`).click()
    const defaultError = page.getByTestId(`delete-error-${defaultNotebook.id}`)
    await expect(defaultError).toBeVisible()
    await expect(defaultError).toContainText('Không thể xóa cuốn vở mặc định.')
    expect(deleteAttempted).toBe(false)
    await expect(page.getByRole('dialog')).toBeHidden()

    // 2. Attempt delete non-empty notebook
    await page.getByTestId(`delete-notebook-button-${nonEmptyNotebook.id}`).click()
    const nonEmptyError = page.getByTestId(`delete-error-${nonEmptyNotebook.id}`)
    await expect(nonEmptyError).toBeVisible()
    await expect(nonEmptyError).toContainText('Không thể xóa cuốn vở còn chứa ghi chú.')
    expect(deleteAttempted).toBe(false)
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('AC-4: Given vở không mặc định và rỗng When xác nhận xóa Then xóa và focus chuyển hợp lệ', async ({
    page,
  }) => {
    let currentNotebooks = [defaultNotebook, regularNotebook]

    await page.route('**/api/v1/notebooks', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ notebooks: currentNotebooks }),
        })
      }
      return route.fallback()
    })

    await page.route('**/api/v1/notebooks/*', (route) => {
      if (route.request().method() === 'DELETE') {
        currentNotebooks = [defaultNotebook]
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            deleted_notebook_id: regularNotebook.id,
            account_revision: 2,
            data_epoch: 1,
          }),
        })
      }
      return route.fallback()
    })

    await page.goto('/notes')

    // Click delete on regular empty notebook
    await page.getByTestId(`delete-notebook-button-${regularNotebook.id}`).click()

    // Dialog opens and Hủy button has focus
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const cancelButton = page.getByTestId('confirm-dialog-cancel')
    await expect(cancelButton).toBeFocused()

    // Confirm deletion
    await page.getByTestId('confirm-dialog-confirm').click()

    // Dialog closes, notebook removed
    await expect(dialog).toBeHidden()
    const list = page.getByTestId('notebook-list')
    await expect(list.locator(':scope > li')).toHaveCount(1)
    await expect(list).not.toContainText('Sổ tay nghiên cứu')

    // Selection and focus move to notebook above (the default notebook)
    await expect(page.getByTestId('selected-notebook-title')).toHaveText('Ghi chú nhanh')
    const defaultItemButton = page.getByTestId(`notebook-item-${defaultNotebook.id}`)
    await expect(defaultItemButton).toBeFocused()
  })
})
