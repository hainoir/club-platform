import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv, waitForProtectedAppReady } from './helpers/auth'

test.describe('auth refresh regression', () => {
    test('dashboard remains ready after reload', async ({ page }) => {
        const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

        await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
        await gotoProtectedPath(page, '/')
        await expect(page.locator('main h2').first()).toBeVisible({ timeout: 15_000 })

        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForProtectedAppReady(page, 3_000)

        await expect(page).toHaveURL(/\/(?:[?#].*)?$/)
        await expect(page.locator('main h2').first()).toBeVisible({ timeout: 3_000 })
        await expect(page.getByText('Checking session...')).toBeHidden()
    })

    test('duty page remains ready after reload', async ({ page }) => {
        const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

        await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
        await gotoProtectedPath(page, '/duty')
        await expect(page.locator('main h2').first()).toBeVisible({ timeout: 15_000 })

        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForProtectedAppReady(page, 3_000)

        await expect(page).toHaveURL(/\/duty(?:[?#].*)?$/)
        await expect(page.locator('main h2').first()).toBeVisible({ timeout: 3_000 })
        await expect(page.getByText('Checking session...')).toBeHidden()
    })
})
