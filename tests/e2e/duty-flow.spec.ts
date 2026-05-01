import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

test.describe('Duty flow', () => {
    test.setTimeout(60_000)

    test('unauthenticated user is redirected from duty page', async ({ page }) => {
        await page.goto('/duty')
        await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
    })

    test('member can open duty page while admin actions stay unavailable', async ({ page }) => {
        const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

        await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
        await gotoProtectedPath(page, '/duty')

        await expect(page.getByRole('heading', { level: 2, name: '值班管理' })).toBeVisible({ timeout: 45_000 })
        await expect(page.getByText('今日排班总数')).toBeVisible()
        await expect(page.getByRole('heading', { name: '今日值班名单' })).toBeVisible()
        await expect(page.getByRole('heading', { name: '今日重点提醒' })).toBeVisible()
        await expect(page.getByText('普通成员可查看排班；排班、钥匙和审批操作仅管理员可用。')).toBeVisible()
        await expect(page.getByRole('button', { name: '代班审批' })).toBeDisabled()
        await expect(page.getByRole('button', { name: '请假审批' })).toBeDisabled()
        await expect(page.getByRole('button', { name: /指派成员/ })).toHaveCount(0)
    })
})
