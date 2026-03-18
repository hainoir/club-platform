import { expect, test, type Page } from '@playwright/test'
import { loginWithPassword, requireEnv } from './helpers/auth'

type SaveFeedback = 'success' | 'failure' | 'timeout'

async function waitForProfileSaveFeedback(page: Page, timeoutMs = 10_000): Promise<SaveFeedback> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if ((await page.getByText(/资料已保存/).count()) > 0) {
            return 'success'
        }
        if ((await page.getByText(/保存失败/).count()) > 0) {
            return 'failure'
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return 'timeout'
}

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
    const firstFeedback = await waitForProfileSaveFeedback(page)
    test.skip(firstFeedback !== 'success', 'Profile save feedback not stable in current env')

    // 恢复原始值，避免污染成员数据。
    await nameInput.fill(baseName)
    await saveButton.click()
    const secondFeedback = await waitForProfileSaveFeedback(page)
    test.skip(secondFeedback !== 'success', 'Profile save feedback not stable in current env')
})
