/**
 * Public pages must not scroll sideways on a phone. Decorative glow blobs are
 * wider than a phone screen (500–800px); a section that positions one without
 * clipping it widens the whole page, and iOS Safari then lets the visitor drag
 * the layout left and right.
 *
 * Runs at an iPhone-width viewport inside the desktop project, which is the
 * only project PR CI runs.
 */
import { test, expect } from './utils/test'
import { BASE, TENANT_BASE, LOCALE } from './utils/constants'

const PAGES = [
  `${BASE}/${LOCALE}`,
  `${BASE}/${LOCALE}/platform-pricing`,
  `${BASE}/${LOCALE}/about`,
  `${BASE}/${LOCALE}/creators`,
  `${BASE}/${LOCALE}/auth/login`,
  `${TENANT_BASE}/${LOCALE}`,
  `${TENANT_BASE}/${LOCALE}/courses`,
  `${TENANT_BASE}/${LOCALE}/pricing`,
]

test.describe('Public pages at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const url of PAGES) {
    test(`no horizontal scroll: ${url.replace(/^https?:\/\/[^/]+/, '')} (${new URL(url).hostname})`, async ({ page }) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      // Wait for content before measuring; the login page has a form but no main or h1.
      await expect(page.locator('main, h1, form').first()).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1)
    })
  }
})
