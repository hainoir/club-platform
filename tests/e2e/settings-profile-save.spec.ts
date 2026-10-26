import { expect, test, type Page } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword } from './helpers/auth'

const SEEDED_MEMBER_EMAIL = 'E2E_MEMBER_EMAIL'
const SEEDED_MEMBER_PASSWORD = 'E2E_MEMBER_PASSWORD'
const SEEDED_MEMBER_NAME = 'E2E 成员'

function requireSeededMemberCredentials(): { email: string; password: string } {
    const email = process.env[SEEDED_MEMBER_EMAIL]
    const password = process.env[SEEDED_MEMBER_PASSWORD]
    if (!email || !password) {
        throw new Error(`Missing ${SEEDED_MEMBER_EMAIL} or ${SEEDED_MEMBER_PASSWORD}; run against the seeded E2E database`)
    }
    return { email, password }
}

async function waitForProfileSaveFeedback(page: Page, timeoutMs = 10_000): Promise<'success' | 'failure' | 'timeout'> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await page.getByText('资料已保存', { exact: true }).count()) {
            return 'success'
        }
        if (await page.getByText('保存失败', { exact: true }).count()) {
            return 'failure'
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return 'timeout'
}

test('settings profile save shows success feedback', async ({ page }) => {
    test.setTimeout(60_000)
    const credentials = requireSeededMemberCredentials()

    await loginWithPassword(page, credentials.email, credentials.password)
    await gotoProtectedPath(page, '/settings#account')

    const nameInput = page.locator('#profile-name')
    const saveButton = page.getByRole('button', { name: '保存资料', exact: true })
    await expect(nameInput).toBeVisible()
    await expect(saveButton).toBeVisible()
    await expect(nameInput).toHaveValue(SEEDED_MEMBER_NAME)

    const updatedName = `${SEEDED_MEMBER_NAME}-e2e`
    await nameInput.fill(updatedName)
    await saveButton.click()
    expect(await waitForProfileSaveFeedback(page)).toBe('success')

    await gotoProtectedPath(page, '/settings#account')
    const restoredNameInput = page.locator('#profile-name')
    const restoredSaveButton = page.getByRole('button', { name: '保存资料', exact: true })
    await expect(restoredNameInput).toBeVisible()
    await expect(restoredSaveButton).toBeVisible()
    await expect(restoredNameInput).toHaveValue(updatedName)

    await restoredNameInput.fill(SEEDED_MEMBER_NAME)
    await restoredSaveButton.click()
    expect(await waitForProfileSaveFeedback(page)).toBe('success')
})
