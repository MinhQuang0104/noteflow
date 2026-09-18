import { expect, test } from '@playwright/test'

test('a direct UI deep link uses the SPA fallback', async ({ page }) => {
  await page.goto('/smoke/deep-link')

  await expect(page.getByRole('heading', { level: 2, name: 'Deep link hoạt động' })).toBeVisible()
})

for (const path of ['/api/not-a-route', '/login', '/logout']) {
  test(`${path} remains backend-owned`, async ({ request }) => {
    const response = await request.get(path, { headers: { Accept: 'application/json' } })
    const body = await response.text()

    expect(response.status()).toBe(404)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(body).not.toContain('<div id="app"></div>')
  })
}

test('/up remains Laravel-owned', async ({ request }) => {
  const response = await request.get('/up')

  expect(response.status()).toBe(200)
  expect(await response.text()).not.toContain('<div id="app"></div>')
})

test('an API-like UI path is not captured by the backend prefix', async ({ request }) => {
  const response = await request.get('/apiary')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/html')
  expect(await response.text()).toContain('<div id="app"></div>')
})
