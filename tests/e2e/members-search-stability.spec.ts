import { expect, test } from '@playwright/test'
import { loginWithPassword, requireEnv } from './helpers/auth'

test('members search stays stable while typing queries', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await page.goto('/members')
    await expect(page).toHaveURL(/\/members(?:\?.*)?$/)

    const searchInput = page.locator('input[type="search"]').first()
    await expect(searchInput).toBeVisible()

    for (const keyword of ['no-match-keyword', '1234567890', 'zzzzzz-not-found']) {
        await searchInput.fill(keyword)
        await page.waitForTimeout(400)

        await expect(page).toHaveURL(/\/members(?:\?.*)?$/)
        await expect(searchInput).toBeVisible()
    }

    await searchInput.fill('')
    await page.waitForTimeout(400)
    await expect(page).toHaveURL(/\/members(?:\?.*)?$/)
    await expect(searchInput).toBeVisible()
})
