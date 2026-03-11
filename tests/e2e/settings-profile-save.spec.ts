import { expect, test } from '@playwright/test'
import { loginWithPassword, requireEnv } from './helpers/auth'

test('settings profile save shows success feedback', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await page.goto('/settings#account')

    const nameInput = page.locator('#profile-name')
    test.skip((await nameInput.count()) === 0, 'Profile form is not available for current account')

    await expect(nameInput).toBeVisible()
    const originalName = (await nameInput.inputValue()).trim()
    const baseName = originalName.length >= 2 ? originalName : '测试成员'
    const updatedName = `${baseName}-e2e`

    const saveButton = page.getByRole('button', { name: '保存资料' })

    await nameInput.fill(updatedName)
    await saveButton.click()
    await expect(page.getByText(/资料已保存/).last()).toBeVisible()

    // Restore the original value to avoid polluting member data.
    await nameInput.fill(baseName)
    await saveButton.click()
    await expect(page.getByText(/资料已保存/).last()).toBeVisible()
})
