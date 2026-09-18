import { expect, test } from '@playwright/test'

test('the authenticated shell is responsive without horizontal overflow', async ({ page }) => {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ owner: { id: 1, name: 'Owner', email: 'owner@example.test' } }),
    }),
  )
  await page.goto('/today')

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)

  const mobileNavigationButton = page.getByRole('button', { name: 'Mở điều hướng' })
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await expect(mobileNavigationButton).toBeVisible()
  } else {
    await expect(mobileNavigationButton).toBeHidden()
  }
})
