import { expect, test, type Browser, type Page } from '@playwright/test'

import { getTestJournalState, resetTestDatabase } from './helpers/db-state'

async function login(page: Page) {
  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill('owner@example.test')
  await page.locator('input[name="password"]').fill('secret123')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/today$/)
}

const isJournalWrite = (response: import('@playwright/test').Response) =>
  response.request().method() === 'PUT' && /\/journals\//.test(response.url())

async function save(page: Page, text: string, status = 200) {
  await page.locator('#journal-editor').fill(text)
  const response = page.waitForResponse(isJournalWrite)
  await page.locator('#journal-save-btn').click()
  const result = await response
  expect(result.status()).toBe(status)
  if (status === 200) await expect(page.locator('#journal-save-status')).toHaveText('Đã lưu nhật ký.')
  return result
}

async function twoDevices(browser: Browser, pageB: Page, baseURL: string | undefined) {
  const contextA = await browser.newContext({ baseURL, timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 900 } })
  const pageA = await contextA.newPage()
  try {
    await login(pageA)
    await login(pageB)
    await pageA.goto('/challenges')
    await pageA.locator('#create-challenge-btn').click()
    await pageA.locator('#create-name').fill('Shared journal')
    await pageA.locator('#create-target').fill('5')
    const read = pageA.waitForResponse(response => response.request().method() === 'GET' && /\/journals\//.test(response.url()))
    await pageA.locator('#create-submit-btn').click()
    const initial = await (await read).json()
    const { challenge_id: id, local_date: date } = initial.journal as { challenge_id: string; local_date: string }
    await save(pageA, 'Common journal')
    await pageB.goto('/challenges')
    await pageB.getByRole('region', { name: 'Danh sách Challenge' }).getByText('Shared journal', { exact: true }).click()
    await expect(pageB.locator('#journal-editor')).toHaveValue('Common journal')
    return { contextA, pageA, id, date }
  } catch (error) {
    await contextA.close()
    throw error
  }
}

async function conflict(pageA: Page, pageB: Page, id: string, date: string, local = 'Device B private draft', server = 'Device A saved version') {
  await pageB.locator('#journal-editor').fill(local)
  await save(pageA, server)
  const before = getTestJournalState(id, date)
  expect(before).toMatchObject({ journal: server, journal_version: 2, completion_version: 0, is_done: false, account_revision: 3, journal_commands: 2 })
  // Preflight/polling must not silently rebase this dirty editor.
  const response = await save(pageB, local, 409)
  expect(await response.json()).toMatchObject({ code: 'version_conflict', resource_id: id, current_version: 2, current_snapshot: { challenge_id: id, local_date: date, journal: server, journal_version: 2 } })
  expect(getTestJournalState(id, date)).toEqual(before)
  await expect(pageB.locator('#journal-editor')).toHaveValue(local)
  await expect(pageB.locator('#content-conflict-dialog')).not.toBeVisible()
  await pageB.locator('#journal-conflict-open').click()
  return before!
}

test.describe('Story 1.6 — real journal conflict persistence', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)
  test.beforeEach(() => resetTestDatabase())

  test('DB evidence reads the exact journal without altering completion or revision', async ({ page }) => {
    await login(page)
    await page.goto('/challenges')
    await page.locator('#create-challenge-btn').click()
    await page.locator('#create-name').fill('Conflict persistence')
    await page.locator('#create-target').fill('5')
    const read = page.waitForResponse(response => response.request().method() === 'GET' && /\/journals\//.test(response.url()))
    await page.locator('#create-submit-btn').click()
    const initial = await (await read).json()
    const { challenge_id: id, local_date: date } = initial.journal
    await page.locator('#journal-editor').fill('Saved through the real API')
    const saved = page.waitForResponse(response => response.request().method() === 'PUT' && /\/journals\//.test(response.url()))
    await page.locator('#journal-save-btn').click()
    expect((await saved).status()).toBe(200)
    const snapshot = getTestJournalState(id, date)
    expect(snapshot).toMatchObject({ journal: 'Saved through the real API', journal_version: 1, completion_version: 0, is_done: false, account_revision: 2 })
    expect(getTestJournalState('00000000-0000-0000-0000-000000000000', date)).toBeNull()
    expect(() => getTestJournalState(id, '2026-02-30')).toThrow(/Invalid journal identity/)
  })

  for (const choice of ['local', 'server'] as const) {
    test(`AC1/AC2/AC3 — explicit ${choice} choice persists and both clean devices converge without reload`, async ({ browser, page: pageB, baseURL }) => {
      const { contextA, pageA, id, date } = await twoDevices(browser, pageB, baseURL)
      try {
        const before = await conflict(pageA, pageB, id, date)
        const dialog = pageB.getByRole('dialog', { name: 'Giải quyết xung đột nhật ký' })
        await expect(dialog).toHaveAttribute('aria-modal', 'true')
        await expect(dialog.locator('section').nth(0)).toContainText('Device B private draft')
        await expect(dialog.locator('section').nth(1)).toContainText('Device A saved version')
        await expect(dialog.locator('input:checked')).toHaveCount(0)
        await expect(pageB.locator('#content-conflict-confirm')).toBeDisabled()
        await pageB.locator(`#conflict-${choice}`).check()
        let navigations = 0
        const observe = () => { navigations++ }
        pageA.on('framenavigated', observe)
        pageB.on('framenavigated', observe)
        const acknowledgement = pageB.waitForResponse(isJournalWrite)
        await pageB.locator('#content-conflict-confirm').click()
        const response = await acknowledgement
        expect(response.status()).toBe(200)
        const payload = response.request().postDataJSON()
        expect(payload).toMatchObject({ journal: choice === 'local' ? 'Device B private draft' : 'Device A saved version', base_version: 2, data_epoch: 1 })
        const expectedText = choice === 'local' ? 'Device B private draft' : 'Device A saved version'
        await expect(pageB.locator('#content-conflict-dialog')).not.toBeVisible()
        await expect(pageB.locator('#journal-editor')).toHaveValue(expectedText)
        await expect(pageA.locator('#journal-editor')).toHaveValue(expectedText, { timeout: 15_000 })
        await expect(pageB.locator('#journal-conflict-alert')).not.toBeVisible()
        expect(getTestJournalState(id, date)).toEqual({ ...before, journal: expectedText, journal_version: choice === 'local' ? 3 : 2, account_revision: choice === 'local' ? 4 : 3, journal_commands: 3 })
        expect(navigations).toBe(0)
      } finally {
        await contextA.close()
      }
    })
  }

  test('AC1/AC3 — another server edit invalidates the old selection and requires a fresh decision', async ({ browser, page: pageB, baseURL }) => {
    const { contextA, pageA, id, date } = await twoDevices(browser, pageB, baseURL)
    try {
      await conflict(pageA, pageB, id, date)
      await pageB.locator('#conflict-local').check()
      await save(pageA, 'Server changed again')
      const before = getTestJournalState(id, date)
      const conflictResponse = pageB.waitForResponse(isJournalWrite)
      await pageB.locator('#content-conflict-confirm').click()
      const response = await conflictResponse
      expect(response.status()).toBe(409)
      expect(response.request().postDataJSON().base_version).toBe(2)
      expect(await response.json()).toMatchObject({ current_version: 3, current_snapshot: { journal: 'Server changed again', journal_version: 3 } })
      expect(getTestJournalState(id, date)).toEqual(before)
      await expect(pageB.locator('#content-conflict-dialog')).toContainText('Server changed again')
      await expect(pageB.locator('#conflict-local')).not.toBeChecked()
      await expect(pageB.locator('#content-conflict-confirm')).toBeDisabled()
      await test.info().attach('focus-after-reconflict', {
        body: JSON.stringify(await pageB.evaluate(() => ({
          tag: document.activeElement?.tagName,
          id: document.activeElement?.id,
          insideDialog: document.querySelector('#content-conflict-dialog')?.contains(document.activeElement),
        }))),
        contentType: 'application/json',
      })
      await pageB.keyboard.press('Escape')
      await expect(pageB.locator('#content-conflict-dialog')).not.toBeVisible()
      await expect(pageB.locator('#journal-editor')).toHaveValue('Device B private draft')
      await pageB.locator('#journal-conflict-open').click()
      await pageB.locator('#conflict-server').check()
      const ack = pageB.waitForResponse(isJournalWrite)
      await pageB.locator('#content-conflict-confirm').click()
      expect((await ack).status()).toBe(200)
      await expect(pageB.locator('#journal-editor')).toHaveValue('Server changed again')
      expect(getTestJournalState(id, date)).toEqual({ ...before!, journal_commands: 4 })
    } finally {
      await contextA.close()
    }
  })

  test('AC3 — losing a resolution response after real commit retries the immutable UUID/payload exactly once', async ({ browser, page: pageB, baseURL }) => {
    const { contextA, pageA, id, date } = await twoDevices(browser, pageB, baseURL)
    try {
      await conflict(pageA, pageB, id, date)
      await pageB.locator('#conflict-local').check()
      const commands: unknown[] = []
      let committed = false
      await pageB.route('**/api/v1/challenges/*/journals/*', async route => {
        if (route.request().method() !== 'PUT') return route.continue()
        commands.push(route.request().postDataJSON())
        const response = await route.fetch()
        expect(response.status()).toBe(200)
        if (!committed) {
          committed = true
          expect(getTestJournalState(id, date)).toMatchObject({ journal: 'Device B private draft', journal_version: 3, account_revision: 4, journal_commands: 3 })
          await route.abort('failed')
        } else {
          await route.fulfill({ response })
        }
      })
      await pageB.locator('#content-conflict-confirm').click()
      await expect(pageB.locator('#content-conflict-dialog')).toContainText('Chưa xác định được kết quả lưu')
      const afterCommit = getTestJournalState(id, date)
      await expect(pageB.locator('#journal-editor')).toHaveValue('Device B private draft')
      await pageB.locator('#content-conflict-confirm').click()
      await expect(pageB.locator('#content-conflict-dialog')).not.toBeVisible()
      await expect(pageA.locator('#journal-editor')).toHaveValue('Device B private draft', { timeout: 15_000 })
      expect(commands).toHaveLength(2)
      expect(commands[1]).toEqual(commands[0])
      expect(commands[0]).toMatchObject({ command_id: expect.stringMatching(/^[0-9a-f-]{36}$/i), base_version: 2, data_epoch: 1, journal: 'Device B private draft' })
      expect(getTestJournalState(id, date)).toEqual(afterCommit)
    } finally {
      await contextA.close()
    }
  })

  test('AC4 — real modal keyboard/touch, literal long text, scroll, 200% text zoom/reflow and focus return', async ({ browser, page: pageB, baseURL, isMobile }) => {
    const { contextA, pageA, id, date } = await twoDevices(browser, pageB, baseURL)
    const local = `<img src=x onerror=alert(1)>\n${'local readable line '.repeat(10)}\n`.repeat(35)
    const server = `server ${'unbroken'.repeat(100)}\n${'saved readable line\n'.repeat(50)}`.trimEnd()
    try {
      const before = await conflict(pageA, pageB, id, date, local, server)
      const dialog = pageB.getByRole('dialog', { name: 'Giải quyết xung đột nhật ký' })
      await expect(dialog).toHaveAccessibleDescription(new RegExp(`${id}.*${date}`))
      await expect(dialog.locator('section').nth(0).locator('p')).toHaveText(local)
      await expect(dialog.locator('section').nth(1).locator('p')).toHaveText(server)
      await expect(dialog.locator('img')).toHaveCount(0)
      await expect(pageB.locator('#content-conflict-close')).toBeFocused()
      await pageB.keyboard.press('Shift+Tab')
      await expect(dialog.getByRole('button', { name: 'Để sau', exact: true }).last()).toBeFocused()
      await pageB.keyboard.press('Tab')
      await expect(pageB.locator('#content-conflict-close')).toBeFocused()
      await pageB.getByRole('radio', { name: 'Giữ bản đang nhập trên thiết bị này' }).check()
      await pageB.locator('#content-conflict-confirm').focus()
      await pageB.keyboard.press('Tab')
      await expect(pageB.locator('#content-conflict-close')).toBeFocused()
      await pageB.keyboard.press('Shift+Tab')
      await expect(pageB.locator('#content-conflict-confirm')).toBeFocused()
      await pageB.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(pageB.locator('#journal-conflict-open')).toBeFocused()
      await expect(pageB.locator('#journal-editor')).toHaveValue(local)
      if (isMobile) await pageB.locator('#journal-conflict-open').tap()
      else await pageB.locator('#journal-conflict-open').click()
      await expect(dialog.locator('input:checked')).toHaveCount(0)
      await pageB.setViewportSize({ width: 320, height: 720 })
      await pageB.evaluate(() => { document.documentElement.style.fontSize = '200%' })
      const paragraphs = dialog.locator('section p')
      for (const paragraph of await paragraphs.all()) {
        expect(await paragraph.evaluate(element => ({ scroll: element.scrollHeight > element.clientHeight, wraps: element.scrollWidth <= element.clientWidth + 2 }))).toEqual({ scroll: true, wraps: true })
        await paragraph.evaluate(element => { element.scrollTop = element.scrollHeight })
        expect(await paragraph.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      }
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 2)).toBe(true)
      // Controls remain reachable at narrow width/text zoom; do not claim manual AT from this.
      const later = dialog.getByRole('button', { name: 'Để sau', exact: true }).last()
      if (isMobile) await later.tap()
      else await later.click()
      await expect(dialog).not.toBeVisible()
      await expect(pageB.locator('#journal-conflict-open')).toBeFocused()
      expect(getTestJournalState(id, date)).toEqual(before)
    } finally {
      await contextA.close()
    }
  })
})
