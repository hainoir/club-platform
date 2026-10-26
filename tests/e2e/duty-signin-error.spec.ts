import { expect, test, type Page } from '@playwright/test'

import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'
import { pinBrowserToE2EDutySlot } from './helpers/duty-clock'
import {
    grantStudioGeolocation,
    inaccurateStudioFix,
    insideStudioFix,
    outsideStudioFix,
    readLiveStudioGeofence,
} from './helpers/geolocation'

const SIGN_IN_BUTTON_NAME = '立即验证定位并签到'
const FEEDBACK_TIMEOUT_MS = 3_000
const GEO_DENIED_REGEX = /定位权限被拒绝/
const GEO_PAYLOAD_ERROR_REGEX = /未获取到有效定位信息/
const OUTSIDE_FENCE_REGEX = /超出允许范围/
const SIGN_IN_SUCCESS_TEXT = '签到成功'

async function openDashboardWithEnabledSignIn(page: Page) {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])
    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/')
    const signInButton = page.getByRole('button', { name: SIGN_IN_BUTTON_NAME }).first()
    await expect(signInButton).toBeVisible({ timeout: 15_000 })
    await expect(signInButton).toBeEnabled()
    return signInButton
}

test.describe('Duty sign-in error handling', () => {
    test.beforeEach(async ({ page }) => {
        await pinBrowserToE2EDutySlot(page)
    })

    test('shows feedback when geolocation permission is denied', async ({ page }) => {
        const signInButton = await openDashboardWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(GEO_DENIED_REGEX)).toBeVisible({ timeout: FEEDBACK_TIMEOUT_MS })
    })

    test('shows feedback when the fix is outside the live fence', async ({ page }) => {
        const fence = await readLiveStudioGeofence()
        await grantStudioGeolocation(page.context(), outsideStudioFix(fence))
        const signInButton = await openDashboardWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(OUTSIDE_FENCE_REGEX)).toBeVisible({ timeout: FEEDBACK_TIMEOUT_MS })
    })

    test('shows feedback when geolocation accuracy is insufficient', async ({ page }) => {
        const fence = await readLiveStudioGeofence()
        const fix = inaccurateStudioFix(fence)
        await grantStudioGeolocation(page.context(), fix)
        const signInButton = await openDashboardWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(new RegExp(`当前定位精度约\\s*${fix.accuracy}\\s*米`))).toBeVisible({
            timeout: FEEDBACK_TIMEOUT_MS,
        })
    })

    test('shows feedback when geolocation returns empty payload', async ({ page }) => {
        await page.addInitScript(`(() => {
            Geolocation.prototype.getCurrentPosition = function (success) {
                success(null);
            };
        })();`)
        const signInButton = await openDashboardWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(GEO_PAYLOAD_ERROR_REGEX)).toBeVisible({ timeout: FEEDBACK_TIMEOUT_MS })
    })

    test('shows feedback when duty_logs insert fails', async ({ page }) => {
        const fence = await readLiveStudioGeofence()
        await grantStudioGeolocation(page.context(), insideStudioFix(fence))
        const signInButton = await openDashboardWithEnabledSignIn(page)
        await page.route('**/rest/v1/rpc/submit_duty_sign_in', async (route) => {
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'mock duty_logs insert failed', code: 'P0001' }),
            })
        })
        await signInButton.click()
        await expect(page.getByText('签到失败', { exact: true })).toBeVisible({ timeout: FEEDBACK_TIMEOUT_MS })
        await expect(page.getByText('mock duty_logs insert failed')).toBeVisible()
    })

    test('shows feedback when duty_logs request has network failure', async ({ page }) => {
        const fence = await readLiveStudioGeofence()
        await grantStudioGeolocation(page.context(), insideStudioFix(fence))
        const signInButton = await openDashboardWithEnabledSignIn(page)
        await page.route('**/rest/v1/rpc/submit_duty_sign_in', async (route) => {
            await route.abort('failed')
        })
        await signInButton.click()
        await expect(page.getByText('签到失败', { exact: true })).toBeVisible({ timeout: FEEDBACK_TIMEOUT_MS })
        await expect(page.getByText(/Failed to fetch/i)).toBeVisible()
    })

    test('shows success when the fix is inside the fence', async ({ page }) => {
        const fence = await readLiveStudioGeofence()
        await grantStudioGeolocation(page.context(), insideStudioFix(fence))
        const signInButton = await openDashboardWithEnabledSignIn(page)
        await page.route('**/rest/v1/rpc/submit_duty_sign_in', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify('signed_in'),
            })
        })
        await signInButton.click()
        await expect(page.getByText(SIGN_IN_SUCCESS_TEXT, { exact: true })).toBeVisible({ timeout: FEEDBACK_TIMEOUT_MS })
    })
})
