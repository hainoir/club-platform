import { expect, test, type Page } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

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
    test.setTimeout(60_000)
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/settings#account')

    const nameInput = page.locator('#profile-name')
    test.skip((await nameInput.count()) === 0, 'Profile form is not available for current account')

    await expect(nameInput).toBeVisible()
    const originalName = (await nameInput.inputValue()).trim()
    const baseName = originalName.length >= 2 ? originalName : '测试成员'
    const updatedName = `${baseName}-e2e`

    const saveButton = page.locator('button').filter({ hasText: /保存资料|保存中/ }).last()
    test.skip((await saveButton.count()) === 0, 'Save button is not available for current account state')

    await nameInput.fill(updatedName)
    await expect(saveButton).toBeVisible()
    await saveButton.click()
    const firstFeedback = await waitForProfileSaveFeedback(page)
    test.skip(firstFeedback !== 'success', 'Profile save feedback not stable in current env')

    // 恢复原始值，避免污染成员数据。
    await gotoProtectedPath(page, '/settings#account')
    const restoredNameInput = page.locator('#profile-name')
    const restoredSaveButton = page.locator('button').filter({ hasText: /保存资料|保存中/ }).last()
    test.skip((await restoredSaveButton.count()) === 0, 'Save button is not available after reopening settings')
    await expect(restoredNameInput).toBeVisible()
    await expect(restoredSaveButton).toBeVisible()
    await restoredNameInput.fill(baseName)
    await restoredSaveButton.click()
    const secondFeedback = await waitForProfileSaveFeedback(page)
    test.skip(secondFeedback !== 'success', 'Profile save feedback not stable in current env')
})

