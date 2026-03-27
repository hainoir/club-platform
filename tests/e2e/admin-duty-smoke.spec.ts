import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

test.describe('Admin duty smoke', () => {
    test.setTimeout(60_000)

    test('admin can open swap hall and approve accepted request', async ({ page }) => {
        const env = requireEnv(['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'])

        await loginWithPassword(page, env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD)
        await gotoProtectedPath(page, '/duty')

        const swapHallButton = page.getByRole('button', { name: /代班大厅/ })
        await expect(swapHallButton).toBeVisible({ timeout: 15_000 })
        await swapHallButton.click()
        await expect(page.getByRole('heading', { name: '代班大厅' })).toBeVisible()

        const approveButton = page.getByRole('button', { name: '批准' }).first()
        test.skip((await approveButton.count()) === 0, 'No accepted swap requests to approve')

        await approveButton.click()
        await expect(page.getByRole('heading', { name: '代班大厅' })).toBeVisible()
    })

    test('receiver can confirm key transfer', async ({ page }) => {
        const env = requireEnv(['E2E_KEY_RECEIVER_EMAIL', 'E2E_KEY_RECEIVER_PASSWORD'])

        await loginWithPassword(page, env.E2E_KEY_RECEIVER_EMAIL, env.E2E_KEY_RECEIVER_PASSWORD)
        await gotoProtectedPath(page, '/duty')

        await expect(page.getByRole('heading', { level: 3, name: '钥匙交接' })).toBeVisible({ timeout: 15_000 })

        const confirmButton = page.getByRole('button', { name: '确认接收' }).first()
        test.skip((await confirmButton.count()) === 0, 'No pending key transfer to confirm')

        await confirmButton.click()
        await expect(page.getByRole('heading', { level: 3, name: '钥匙交接' })).toBeVisible()
    })
})


