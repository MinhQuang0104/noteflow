import { expect, test } from '@playwright/test'

test('a direct UI deep link uses the SPA fallback', async ({ page }) => {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthenticated."}' }),
  )
  await page.goto('/notes')

  await expect(page).toHaveURL(/\/sign-in\?redirect=\/notes$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Đăng nhập NoteFlow' })).toBeVisible()
})

for (const path of ['/api/not-a-route']) {
  test(`${path} remains backend-owned`, async ({ request }) => {
    const response = await request.get(path, { headers: { Accept: 'application/json' } })
    const body = await response.text()

    expect(response.status()).toBe(404)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(body).not.toContain('<div id="app"></div>')
  })
}

for (const path of ['/login', '/logout']) {
  test(`${path} remains a method-constrained backend route`, async ({ request }) => {
    const response = await request.get(path, { headers: { Accept: 'application/json' } })

    expect(response.status()).toBe(405)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(await response.text()).not.toContain('<div id="app"></div>')
  })
}

test('Back after logout cannot reveal a previously visited private view', async ({ page }) => {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'private, no-store' },
      body: JSON.stringify({ owner: { id: 1, name: 'Owner', email: 'owner@example.test' } }),
    }),
  )
  await page.route('**/logout', (route) => route.fulfill({ status: 204 }))

  await page.goto('/today')
  const navigationButton = page.getByRole('button', { name: 'Mở điều hướng' })
  if (await navigationButton.isVisible()) await navigationButton.click()
  await page.getByRole('link', { name: 'Ghi chú' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Ghi chú' })).toBeVisible()
  if (await navigationButton.isVisible()) await navigationButton.click()
  await page.getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Đăng nhập NoteFlow' })).toBeVisible()

  await page.goBack()

  await expect(page.getByRole('heading', { level: 2, name: 'Đăng nhập NoteFlow' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Ghi chú' })).toHaveCount(0)
})

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
