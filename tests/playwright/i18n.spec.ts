import { test, expect } from './utils/test'
import { BASE } from './utils/constants'
import { loginAsStudent } from './utils/auth'

test.describe('English URLs', () => {
  test('the root stays locale-free and ignores a previous language preference', async ({ page, context }) => {
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'es', url: BASE }])
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es' })
    await page.goto(`${BASE}/`)
    await expect(page).toHaveURL(`${BASE}/`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('button', { name: /toggle language/i })).toHaveCount(0)
  })

  for (const oldLocale of ['en', 'es']) {
    test(`old /${oldLocale} links reach the English page and preserve the query`, async ({ page }) => {
      await page.goto(`${BASE}/${oldLocale}/auth/login?next=%2Fcourses`)
      await expect(page).toHaveURL(`${BASE}/auth/login?next=%2Fcourses`)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.getByTestId('login-submit')).toHaveText(/log\s?in|sign\s?in/i)
    })
  }

  test('authenticated navigation emits bare English URLs', async ({ page }) => {
    await loginAsStudent(page)
    await expect(page).toHaveURL(`${BASE}/dashboard/student`)
    const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href')!))
    expect(hrefs.filter((href) => /^\/(en|es)(\/|$)/.test(href))).toEqual([])
    await expect(page.getByRole('button', { name: /toggle language/i })).toHaveCount(0)
  })
})
