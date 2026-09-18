import { expect, test } from '@playwright/test'

test('the Vue shell presents the private owner login', async ({ page }) => {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthenticated."}' }),
  )
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'NoteFlow' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Đăng nhập NoteFlow' })).toBeVisible()
  await expect(page.getByText('không mở đăng ký công khai')).toBeVisible()
})

test('the proxied foundation endpoint returns canonical JSON', async ({ request }) => {
  const response = await request.get('/api/v1/foundation', {
    headers: { Accept: 'application/json' },
  })

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/json')
  expect(await response.json()).toEqual({ status: 'ok', service: 'noteflow-api' })
})
