import { expect, test } from '@playwright/test'

test.describe('Challenges User Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authenticated owner session
    await page.route('**/api/v1/session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ owner: { id: 1, name: 'Owner', email: 'owner@example.test' } }),
      }),
    )

    // Mock account context
    await page.route('**/api/v1/account', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({
          timezone: 'Asia/Ho_Chi_Minh',
          account_date: '2026-09-19',
          week: { start_date: '2026-09-14', end_date: '2026-09-20' },
          account_revision: 1,
          data_epoch: 1,
          write_state: 'open',
        }),
      }),
    )
  })

  test('AC1, AC2, AC3 — complete challenge lifecycle on desktop and mobile viewports', async ({ page }) => {
    let mockChallenges = [
      {
        id: 'c1000000-0000-4000-8000-000000000001',
        name: 'Đọc sách 30 phút',
        description: 'Đọc sách mỗi ngày',
        start_date: '2026-09-19',
        target_days: 5,
        row_version: 1,
        created_at: '2026-09-19T08:00:00Z',
        updated_at: '2026-09-19T08:00:00Z',
      },
    ]

    // Route challenges API
    await page.route('**/api/v1/challenges', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'private, no-store' },
          body: JSON.stringify({ challenges: mockChallenges }),
        })
      }

      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}')
        if (body.target_days < 1 || body.target_days > 7) {
          return route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({
              message: 'Dữ liệu không hợp lệ.',
              errors: { target_days: ['Mục tiêu số ngày phải là số nguyên từ 1 đến 7.'] },
            }),
          })
        }

        const newChallenge = {
          id: 'c2000000-0000-4000-8000-000000000002',
          name: body.name,
          description: body.description ?? null,
          start_date: '2026-09-19',
          target_days: body.target_days,
          row_version: 1,
          created_at: '2026-09-19T10:00:00Z',
          updated_at: '2026-09-19T10:00:00Z',
        }
        mockChallenges.push(newChallenge)

        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'private, no-store' },
          body: JSON.stringify({
            challenge: newChallenge,
            account_revision: 2,
            data_epoch: 1,
          }),
        })
      }
    })

    await page.route('**/api/v1/challenges/*', async (route) => {
      const url = route.request().url()
      const id = url.split('/').pop()?.split('?')[0]
      const challenge = mockChallenges.find((c) => c.id === id)

      if (route.request().method() === 'GET') {
        if (!challenge) {
          return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not found"}' })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'private, no-store' },
          body: JSON.stringify({ challenge }),
        })
      }

      if (route.request().method() === 'PATCH') {
        const body = JSON.parse(route.request().postData() || '{}')
        if (challenge) {
          challenge.name = body.name
          challenge.description = body.description ?? null
          challenge.row_version += 1
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'private, no-store' },
          body: JSON.stringify({
            challenge,
            account_revision: 3,
            data_epoch: 1,
          }),
        })
      }
    })

    // Navigate to /today first, then to /challenges
    await page.goto('/today')
    const mobileNavBtn = page.getByRole('button', { name: 'Mở điều hướng' })
    if (await mobileNavBtn.isVisible()) {
      await mobileNavBtn.click()
    }
    await page.getByRole('link', { name: 'Challenge' }).click()

    await expect(page.getByRole('heading', { level: 2, name: 'Quản lý Challenge' })).toBeVisible()

    // 1. Verify list shows existing challenge
    await expect(page.getByText('Đọc sách 30 phút')).toBeVisible()
    await expect(page.getByText('Mục tiêu: 5 ngày/tuần')).toBeVisible()

    // Responsive check: no horizontal overflow
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)

    // 2. AC2: Test invalid creation (target > 7)
    await page.locator('#create-challenge-btn').click()
    await expect(page.getByRole('heading', { level: 3, name: 'Tạo challenge mới' })).toBeVisible()

    // Verify AC1 invariant: no start-date picker input and no weekday picker
    await expect(page.locator('input[type="date"]')).toHaveCount(0)
    await expect(page.locator('select[name="weekday"]')).toHaveCount(0)
    await expect(page.locator('#create-start-date-display')).toContainText('2026-09-19')

    // Input invalid target_days via keyboard
    await page.locator('#create-name').fill('Chạy bộ sáng')
    await page.locator('#create-target').fill('9')
    await page.locator('#create-submit-btn').click()

    // Validation error attached to field
    await expect(page.locator('#create-target-error')).toBeVisible()
    await expect(page.locator('#create-target-error')).toContainText('Mục tiêu số ngày phải là số nguyên từ 1 đến 7.')
    // Input preserved
    await expect(page.locator('#create-name')).toHaveValue('Chạy bộ sáng')

    // 3. AC1: Fix target to valid integer 3 and submit
    await page.locator('#create-target').fill('3')
    await page.locator('#create-description').fill('Chạy quanh công viên 5km')
    await page.locator('#create-submit-btn').click()

    // Verify detail view of newly created challenge
    await expect(page.locator('#challenge-detail-name')).toHaveText('Chạy bộ sáng')
    await expect(page.locator('#challenge-detail-target')).toContainText('3 ngày / tuần')
    await expect(page.locator('#challenge-detail-start-date')).toHaveText('2026-09-19')

    // 4. AC3: Edit challenge metadata
    await page.locator('#edit-challenge-btn').click()
    await expect(page.getByRole('heading', { level: 3, name: 'Chỉnh sửa thông tin challenge' })).toBeVisible()

    // Invariant: start_date and target_days are NOT inputs in edit form
    await expect(page.locator('input[name="start_date"]')).toHaveCount(0)
    await expect(page.locator('input[name="target_days"]')).toHaveCount(0)
    await expect(page.locator('form').getByText('3 ngày/tuần')).toBeVisible()
    await expect(page.locator('form').getByText('2026-09-19')).toBeVisible()

    // Update name and description
    await page.locator('#edit-name').fill('Chạy bộ sáng nâng cao')
    await page.locator('#edit-description').fill('Chạy 7km mỗi buổi')
    await page.locator('#edit-submit-btn').click()

    // Verify detail shows updated metadata
    await expect(page.locator('#challenge-detail-name')).toHaveText('Chạy bộ sáng nâng cao')
    await expect(page.locator('#challenge-detail-description')).toHaveText('Chạy 7km mỗi buổi')
    // Start date and target days remain intact
    await expect(page.locator('#challenge-detail-target')).toContainText('3 ngày / tuần')
    await expect(page.locator('#challenge-detail-start-date')).toHaveText('2026-09-19')
  })
})
