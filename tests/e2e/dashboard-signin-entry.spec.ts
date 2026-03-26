import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

test('dashboard sign-in entry is visible', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/')

    await expect(page.getByRole('heading', { name: '值班执行仪表盘' })).toBeVisible()
    await expect(page.getByText('值班考勤打卡')).toBeVisible()

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


