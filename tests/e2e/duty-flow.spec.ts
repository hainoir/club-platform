import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

test.describe('Duty flow', () => {
    test.setTimeout(60_000)

    test('unauthenticated user is redirected from duty page', async ({ page }) => {
        await page.goto('/duty')
        await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
    })

    test('sign-in button state matches current schedule/time', async ({ page }) => {
        const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

        await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
        await gotoProtectedPath(page, '/duty')

        await expect(page.getByRole('heading', { level: 2, name: '值班与考勤大厅' })).toBeVisible({ timeout: 45_000 })
        await expect(page.getByRole('heading', { level: 3, name: '值班考勤打卡' })).toBeVisible()

        const signInButton = page
            .getByRole('button', {
                name: /立即验证定位并签到|您未被安排在当前班次|当前不在班次时间内|正在雷达探距与验证/,
            })
            .first()

        await expect(signInButton).toBeVisible()
        const currentLabel = (await signInButton.textContent()) || ''

        if (currentLabel.includes('立即验证定位并签到')) {
            await expect(signInButton).toBeEnabled()
        } else {
            await expect(signInButton).toBeDisabled()
        }
    })
})
