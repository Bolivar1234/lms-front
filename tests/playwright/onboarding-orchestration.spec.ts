import { expect, test } from './utils/test'
import { TENANT_BASE } from './utils/constants'
import { loginAsAdmin } from './utils/auth'

test.describe('onboarding orchestration', () => {
  test('keeps tours on demand and promotes one admin next action', async ({ page }) => {
    await loginAsAdmin(page)
    await page.evaluate(() => localStorage.removeItem('tours-disabled'))
    await page.goto(`${TENANT_BASE}/dashboard/admin`)

    await expect(page.getByTestId('admin-dashboard').filter({ visible: true })).toBeVisible()
    await page.waitForTimeout(1_000)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('onboarding-next-step')).toHaveCount(1)
    await expect(page.getByTestId('onboarding-milestone')).toBeVisible()
    await expect(page.getByText(/more steps?$/)).toBeVisible()

    await page.getByRole('button', { name: 'Replay tour' }).click()
    await expect(page.getByRole('dialog', { name: 'Getting Started Checklist' })).toBeVisible()
  })

  test('an old Spanish dashboard URL keeps English onboarding', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${TENANT_BASE}/es/dashboard/admin`)

    await expect(page).toHaveURL(`${TENANT_BASE}/dashboard/admin`)
    await expect(page.getByText('Do this next', { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replay tour' })).toBeVisible()
  })
})
