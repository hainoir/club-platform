import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

test('dashboard sign-in entry is visible', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/')

    await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('值班考勤打卡')).toBeVisible()
    await expect(page.getByRole('button', { name: /代班大厅/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /我要请假/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: '钥匙交接' })).toBeVisible()
    await expect(page.getByText('今日排班总数')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '今日值班名单' })).toHaveCount(0)

    const signedBanner = page.getByText('今日已签到')
    if ((await signedBanner.count()) > 0) {
        await expect(signedBanner.first()).toBeVisible()
        return
    }

    const signInButton = page.getByRole('button', {
        name: /立即验证定位并签到|当前不在班次时间内|您未被安排在当前班次|正在雷达探距与验证/
    }).first()

    await expect(signInButton).toBeVisible()
})


