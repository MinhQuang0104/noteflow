import { expect, test } from '@playwright/test'

test('the Vue shell reaches the Laravel foundation endpoint', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'NoteFlow' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('API NoteFlow sẵn sàng')
})

test('the proxied foundation endpoint returns canonical JSON', async ({ request }) => {
  const response = await request.get('/api/v1/foundation', {
    headers: { Accept: 'application/json' },
  })

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/json')
  expect(await response.json()).toEqual({ status: 'ok', service: 'noteflow-api' })
})
