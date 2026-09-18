import { expect, test } from '@playwright/test'

test('the foundation shell does not create horizontal page overflow', async ({ page }) => {
  await page.goto('/smoke/deep-link')

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
})
