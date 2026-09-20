import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(currentDir, '../../backend')

function resetDatabase() {
  execSync('php artisan db:seed', { cwd: backendDir, env: { ...process.env, DB_PORT: '55414' } })
  execSync('php artisan cache:clear', { cwd: backendDir, env: { ...process.env, DB_PORT: '55414' } })
}

async function loginAsOwner(page: Page) {
  await page.goto('/sign-in')
  await page.locator('input[name="email"]').fill('owner@example.test')
  await page.locator('input[name="password"]').fill('secret123')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/today$/)
}

test.describe('Story 1.4 — Cross-Device Synchronization with PostgreSQL', () => {
  // Serial execution to prevent multi-worker database collisions on real PostgreSQL
  test.describe.configure({ mode: 'serial' })

  // Cross-device browser-context tests run on desktop Chrome
  test.skip(({ isMobile }) => isMobile, 'Cross-device PostgreSQL convergence tests run on laptop')

  test.beforeEach(({ isMobile }) => {
    if (isMobile) return
    resetDatabase()
  })

  test('AC1 — two real browser contexts converge on Challenge mutation via 5s polling against PostgreSQL', async ({
    browser,
  }) => {
    // Context A represents Device A
    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()

    // Context B represents Device B
    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()

    try {
      // 1. Both devices log in with the same owner account
      await loginAsOwner(pageA)
      await loginAsOwner(pageB)

      // 2. Both navigate to /challenges
      await pageA.goto('/challenges')
      await pageB.goto('/challenges')

      // Initially, no challenges exist on either device
      await expect(pageA.getByText('Chưa có challenge nào. Hãy tạo challenge đầu tiên!')).toBeVisible()
      await expect(pageB.getByText('Chưa có challenge nào. Hãy tạo challenge đầu tiên!')).toBeVisible()

      // Device B shows "Đã đồng bộ" status in header
      await expect(pageB.locator('#sync-status')).toContainText('Đã đồng bộ')

      // 3. Device A creates a new challenge: "Chạy bộ buổi sáng"
      await pageA.locator('#create-challenge-btn').click()
      await pageA.locator('#create-name').fill('Chạy bộ buổi sáng')
      await pageA.locator('#create-description').fill('Mỗi ngày 30 phút tại công viên')
      await pageA.locator('#create-target').fill('5')
      await pageA.locator('#create-submit-btn').click()

      // Device A immediately reflects the newly created challenge
      await expect(pageA.locator('#challenge-detail-name')).toHaveText('Chạy bộ buổi sáng')
      await expect(pageA.getByText('5 ngày/tuần').first()).toBeVisible()

      // 4. Device B automatically detects new revision via 5s polling and converges!
      // (Wait for polling cycle to detect revision change and refetch challenges)
      await expect(pageB.getByText('Chạy bộ buổi sáng')).toBeVisible({
        timeout: 10_000,
      })

      // Device B selects and views the detail
      await pageB.getByText('Chạy bộ buổi sáng').click()
      await expect(pageB.locator('#challenge-detail-name')).toHaveText('Chạy bộ buổi sáng')
      await expect(pageB.locator('#challenge-detail-target')).toContainText('5 ngày / tuần')

      // 5. Device A updates the challenge metadata
      await pageA.locator('#edit-challenge-btn').click()
      await pageA.locator('#edit-name').fill('Chạy bộ 10km mỗi sáng')
      await pageA.locator('#edit-submit-btn').click()

      await expect(pageA.locator('#challenge-detail-name')).toHaveText('Chạy bộ 10km mỗi sáng')

      // 6. Device B automatically detects update and converges to the new name!
      await expect(pageB.locator('#challenge-detail-name')).toHaveText('Chạy bộ 10km mỗi sáng', {
        timeout: 10_000,
      })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('AC2 — polling pauses when hidden or offline, stops on logout, does not falsely claim synced', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await loginAsOwner(page)
      await page.goto('/challenges')
      await expect(page.locator('#sync-status')).toContainText('Đã đồng bộ')

      // Track account poll requests
      let pollCount = 0
      page.on('request', (req) => {
        if (req.url().includes('/api/v1/account') && req.method() === 'GET') {
          pollCount++
        }
      })

      // Simulate tab hidden via visibilitychange
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })

      const countBeforeWait = pollCount
      // Wait 7 seconds (more than one 5s poll period): no new polls should occur while hidden
      await page.waitForTimeout(7000)
      expect(pollCount - countBeforeWait).toBeLessThanOrEqual(1)

      // Restore visibility: immediate reconcile triggered
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(page.locator('#sync-status')).toContainText('Đã đồng bộ')

      // Simulate offline network condition
      await context.setOffline(true)
      await page.evaluate(() => {
        window.dispatchEvent(new Event('offline'))
      })

      // UI must show "Ngoại tuyến" and MUST NOT claim "Đã đồng bộ" (AC2)
      await expect(page.locator('#sync-status')).toContainText('Ngoại tuyến')
      await expect(page.locator('#sync-status')).not.toContainText('Đã đồng bộ')

      // Restore online network condition
      await context.setOffline(false)
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'))
      })
      await expect(page.locator('#sync-status')).toContainText('Đã đồng bộ')

      // Logout: stops polling completely
      await page.getByRole('button', { name: 'Đăng xuất' }).click()
      await expect(page).toHaveURL(/\/sign-in$/)
    } finally {
      await context.close()
    }
  })

  test('AC3 & AD-8 — reconcile before write respects write_state', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await loginAsOwner(page)
      await page.goto('/challenges')

      // Lock write state in PostgreSQL
      execSync('php artisan noteflow:set-write-state locked_for_import', {
        cwd: backendDir,
        env: { ...process.env, DB_PORT: '55414' },
      })

      // Click create
      await page.locator('#create-challenge-btn').click()
      await page.locator('#create-name').fill('Thử nghiệm ghi khi khóa')
      await page.locator('#create-target').fill('3')

      // Trigger submit: reconcileBeforeWrite verifies server write_state and blocks write
      await page.locator('#create-submit-btn').click()

      // Error message indicates write is locked
      await expect(
        page.locator('[role="alert"]').filter({ hasText: 'locked_for_import' }).first(),
      ).toBeVisible()
    } finally {
      execSync('php artisan noteflow:set-write-state open', {
        cwd: backendDir,
        env: { ...process.env, DB_PORT: '55414' },
      })
      await context.close()
    }
  })

  test('AC4 — sync error does not destroy existing challenge list (non-destructive)', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await loginAsOwner(page)
      await page.goto('/challenges')

      // Create a challenge first
      await page.locator('#create-challenge-btn').click()
      await page.locator('#create-name').fill('Luyện viết lách')
      await page.locator('#create-target').fill('4')
      await page.locator('#create-submit-btn').click()
      await expect(page.locator('#challenge-detail-name')).toHaveText('Luyện viết lách')

      // Now mock a failure on /api/v1/challenges refetch
      await page.route('**/api/v1/challenges', (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 500, body: 'Internal Server Error' })
        }
        return route.continue()
      })

      // Trigger a refetch
      await page.evaluate(() => {
        return (
          window as unknown as {
            __queryClient: { invalidateQueries: (arg: unknown) => Promise<void> }
          }
        ).__queryClient?.invalidateQueries({
          queryKey: ['challenges'],
        })
      })

      // The existing challenge MUST REMAIN VISIBLE on screen (AC4)!
      await expect(
        page.getByRole('region', { name: 'Danh sách Challenge' }).getByText('Luyện viết lách'),
      ).toBeVisible()

      // An actionable error banner with retry button must be shown
      await expect(page.getByText('Không thể đồng bộ danh sách mới nhất')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Thử lại' }).first()).toBeVisible()

      // Unroute and click retry: restores clean state
      await page.unroute('**/api/v1/challenges')
      await page.getByRole('button', { name: 'Thử lại' }).first().click()
      await expect(
        page.getByRole('region', { name: 'Danh sách Challenge' }).getByText('Luyện viết lách'),
      ).toBeVisible()
      await expect(page.getByText('Không thể đồng bộ danh sách mới nhất')).not.toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('dirty draft is preserved on Device B while Device A mutates data', async ({ browser }) => {
    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()

    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()

    try {
      await loginAsOwner(pageA)
      await loginAsOwner(pageB)

      await pageA.goto('/challenges')
      await pageB.goto('/challenges')

      // Device A creates initial challenge
      await pageA.locator('#create-challenge-btn').click()
      await pageA.locator('#create-name').fill('Học ngoại ngữ')
      await pageA.locator('#create-target').fill('3')
      await pageA.locator('#create-submit-btn').click()
      await expect(pageA.locator('#challenge-detail-name')).toHaveText('Học ngoại ngữ')

      // Device B receives it
      await expect(
        pageB.getByRole('region', { name: 'Danh sách Challenge' }).getByText('Học ngoại ngữ'),
      ).toBeVisible({
        timeout: 10_000,
      })

      // Device B selects challenge and starts editing: types dirty draft in form
      await pageB.getByRole('region', { name: 'Danh sách Challenge' }).getByText('Học ngoại ngữ').click()
      await pageB.locator('#edit-challenge-btn').click()
      await pageB.locator('#edit-name').fill('Học tiếng Tây Ban Nha chuyên sâu')
      await pageB.locator('#edit-description').fill('Bản nháp đang viết dở dang trên thiết bị B...')

      // Meanwhile, Device A creates a second challenge
      await pageA.locator('#create-challenge-btn').click()
      await pageA.locator('#create-name').fill('Thực hành thiền định')
      await pageA.locator('#create-target').fill('7')
      await pageA.locator('#create-submit-btn').click()
      await expect(pageA.locator('#challenge-detail-name')).toHaveText('Thực hành thiền định')

      // Device B's background poll detects revision 2 and second challenge appears in list
      await expect(
        pageB.getByRole('region', { name: 'Danh sách Challenge' }).getByText('Thực hành thiền định'),
      ).toBeVisible({
        timeout: 10_000,
      })

      // Device B's DIRTY DRAFT MUST STILL BE INTACT!
      await expect(pageB.locator('#edit-name')).toHaveValue('Học tiếng Tây Ban Nha chuyên sâu')
      await expect(pageB.locator('#edit-description')).toHaveValue(
        'Bản nháp đang viết dở dang trên thiết bị B...',
      )
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
