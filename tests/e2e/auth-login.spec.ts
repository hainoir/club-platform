import { expect, test } from '@playwright/test'
import { loginWithPassword, requireEnv } from './helpers/auth'

test('login success smoke', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('main h2').first()).toBeVisible()
})
