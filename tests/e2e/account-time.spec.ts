import { expect, test } from '@playwright/test'

test('different device timezones render the same account date, week and read-only timezone', async ({ page }) => {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ owner: { id: 1, name: 'Owner', email: 'owner@example.test' } }),
    }),
  )
  await page.route('**/api/v1/account', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'private, no-store' },
      body: JSON.stringify({
        timezone: 'Asia/Ho_Chi_Minh',
        account_date: '2026-09-21',
        week: { start_date: '2026-09-21', end_date: '2026-09-27' },
      }),
    }),
  )

  await page.goto('/today')

  await expect(page.getByRole('heading', { level: 2, name: '2026-09-21' })).toBeVisible()
  await expect(page.getByText('Tuần 2026-09-21 – 2026-09-27')).toBeVisible()

  const navigationButton = page.getByRole('button', { name: 'Mở điều hướng' })
  if (await navigationButton.isVisible()) await navigationButton.click()
  await page.getByRole('link', { name: 'Cài đặt' }).click()

  await expect(page.getByText('Asia/Ho_Chi_Minh')).toBeVisible()
  await expect(page.locator('main input, main select')).toHaveCount(0)
})
