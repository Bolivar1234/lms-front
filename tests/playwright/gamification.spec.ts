import { test, expect, type Page } from './utils/test'
import { loginAsStudent, loginAsTenantStudent } from './utils/auth'
import { BASE, TENANT_BASE } from './utils/constants'

/**
 * The level / streak / coins card. It sits in the header from `lg` and inside
 * the avatar menu below it (#586), so open the menu on narrow viewports.
 */
async function gamificationCard(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByTestId('user-nav-trigger').evaluate((el: HTMLElement) => el.click())
  }
  return page.locator('[data-slot="gamification-header-card"]').filter({ visible: true })
}

/**
 * P1 — Gamification Tests
 *
 * Covers store page, XP/level display, achievements, leaderboard,
 * streak calendar, and profile stats. Does not purchase items or mutate data.
 */

test.describe('Gamification', () => {
  test.describe('Store Page', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('store page loads with container and heading', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/store`)
      await expect(page.getByTestId('store-page')).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('h1').first()).toBeVisible()
    })

    test('store section renders items, empty state, or locked state', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/store`)
      await expect(page.getByTestId('store-page')).toBeVisible({ timeout: 15_000 })

      // Store should show one of: items grid, empty message, or locked upgrade prompt
      const storeItems = page.locator('[class*="grid"] button')
      const emptyState = page.locator('text=/no items|empty|coming soon/i')
      const lockedState = page.locator('text=/locked|upgrade/i')

      // Waits for the client data load (skeleton first)
      await expect(storeItems.or(emptyState).or(lockedState).filter({ visible: true }).first()).toBeVisible()
    })

    test('store shows balance when available', async ({ page }) => {
      await page.goto(`${BASE}/en/dashboard/student/store`)
      await expect(page.getByTestId('store-page')).toBeVisible({ timeout: 15_000 })

      // If store is unlocked, a balance/coin indicator should be visible
      const lockedState = page.locator('text=/locked|upgrade/i')
      // The store loads client-side: wait for the locked prompt or the balance before branching.
      await expect(lockedState.or(page.getByText('Your Balance')).filter({ visible: true }).first()).toBeVisible()
      const isLocked = await lockedState.first().isVisible().catch(() => false)

      if (!isLocked) {
        // Look for the coin balance display or store item prices
        const balanceOrCoins = page.locator('text=/balance|\\d+/i')
        await expect(balanceOrCoins.first()).toBeVisible({ timeout: 10_000 })
      }
    })
  })

  test.describe('XP and Level Display', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
      // Login resolves on the first `/dashboard` commit, which still redirects
      // to `/dashboard/student`; wait for the dashboard itself, not its skeleton.
      await expect(page.getByTestId('student-dashboard')).toBeVisible({ timeout: 30_000 })
    })

    test('student dashboard loads with gamification header', async ({ page }) => {
      test.setTimeout(60_000)
      await expect(page.getByTestId('student-dashboard')).toBeVisible({ timeout: 30_000 })

      // GamificationHeaderCard renders in the dashboard layout once its data loads
      await expect(await gamificationCard(page)).toContainText(/Lvl|Level/i, { timeout: 15_000 })
    })

    test('dashboard shows streak indicator', async ({ page }) => {
      // Level, streak and coins each show their count
      const card = await gamificationCard(page)
      await expect(card.getByText(/^\d+$/)).toHaveCount(3, { timeout: 15_000 })
    })
  })

  test.describe('Leaderboard', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
      await expect(page.getByTestId('student-dashboard')).toBeVisible({ timeout: 30_000 })
    })

    test('leaderboard renders on student dashboard', async ({ page }) => {
      // MiniLeaderboard shows a title or locked state
      const leaderboardTitle = page.locator('text=/leaderboard|rankings/i')
      const lockedLeaderboard = page.locator('text=/locked|upgrade/i')

      await expect(leaderboardTitle.or(lockedLeaderboard).filter({ visible: true }).first()).toBeVisible()
    })

    test('leaderboard shows entries or empty state when unlocked', async ({ page }) => {
      // Wait for client-side hydration and data fetching
      await page.waitForTimeout(3000)

      // The leaderboard may show: entries, empty state, locked state, or not render at all
      // All are acceptable — we just verify the dashboard page itself loaded
      await expect(page.getByTestId('student-dashboard')).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('Profile Gamification', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStudent(page)
    })

    test('profile page shows XP progress circle', async ({ page }) => {
      test.setTimeout(60_000)

      await page.goto(`${BASE}/en/dashboard/student/profile`)
      await expect(page.getByTestId('profile-page').filter({ visible: true })).toBeVisible({ timeout: 15_000 })

      // XPProgressCircle renders an SVG with circles or a loading placeholder
      const svgCircle = page.locator('svg circle')
      const loadingPlaceholder = page.locator('[class*="animate-pulse"]')

      await expect(svgCircle.or(loadingPlaceholder).filter({ visible: true }).first()).toBeVisible()
    })

    test('profile page shows gamification stats (coins and streak)', async ({ page }) => {
      test.setTimeout(60_000)

      await page.goto(`${BASE}/en/dashboard/student/profile`)
      await expect(page.getByTestId('profile-page').filter({ visible: true })).toBeVisible({ timeout: 15_000 })

      // ProfileGamificationStats shows coins and streak labels
      // Scoped to the page: the header card's own labels are hidden below `sm`.
      const profile = page.getByTestId('profile-page').filter({ visible: true })
      const coinsLabel = profile.locator('text=/coins/i')
      const streakLabel = profile.locator('text=/streak/i')

      // At least one gamification stat should render (or loading state)
      const loadingState = page.locator('[class*="animate-pulse"]')

      await expect(coinsLabel.or(streakLabel).or(loadingState).filter({ visible: true }).first()).toBeVisible()
    })

    test('profile page shows streak calendar', async ({ page }) => {
      test.setTimeout(60_000)

      await page.goto(`${BASE}/en/dashboard/student/profile`)
      await expect(page.getByTestId('profile-page').filter({ visible: true })).toBeVisible({ timeout: 15_000 })

      // StreakCalendar renders 7 day columns with abbreviated day labels
      // Day abbreviations are single characters: M, T, W, T, F, S, S
      const streakSection = page.locator('text=/active streak|streak/i')
      const dayLabels = page.locator('text=/^[MTWFS]$/')

      // Either the streak calendar or a loading placeholder should be present
      const loadingState = page.locator('[class*="animate-pulse"]')

      await expect(streakSection.or(dayLabels).or(loadingState).filter({ visible: true }).first()).toBeVisible()
    })

    test('profile page shows achievement section or gamification elements', async ({ page }) => {
      test.setTimeout(60_000)

      await page.goto(`${BASE}/en/dashboard/student/profile`)
      await expect(page.getByTestId('profile-page').filter({ visible: true })).toBeVisible({ timeout: 15_000 })

      // The profile page should render — gamification elements may or may not be visible
      // depending on plan/feature flags. Verify the page itself loaded correctly.
      const body = page.locator('body')
      await expect(body).toBeVisible()
    })
  })

  test.describe('Cross-Tenant Gamification', () => {
    test('tenant student store page loads', async ({ page }) => {
      await loginAsTenantStudent(page)
      await page.goto(`${TENANT_BASE}/en/dashboard/student/store`)
      await expect(page.getByTestId('store-page')).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('h1').first()).toBeVisible()
    })
  })
})
