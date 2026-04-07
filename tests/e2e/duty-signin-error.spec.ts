import { expect, test, type Page } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'
const SIGN_IN_BUTTON_REGEX = /立即验证定位并签到|正在雷达探距与验证/
const GEO_DENIED_REGEX = /定位权限被拒绝|您拒绝了定位请求/
const GEO_PAYLOAD_ERROR_REGEX = /定位数据异常|未获取到有效定位信息|Location payload is empty|Sign-in failed/
const SIGN_IN_ERROR_REGEX = /签到记录失败|打卡存档失败|签到失败|mock duty_logs insert failed|Failed to fetch|fetch failed/i
async function openDutyWithEnabledSignIn(page: Page) {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])
    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/duty')
    const signInButton = page.getByRole('button', { name: SIGN_IN_BUTTON_REGEX }).first()
    test.skip((await signInButton.count()) === 0, 'Sign-in action is not visible for current account')
    test.skip(await signInButton.isDisabled(), 'Current account is not in active duty period')
    await expect(signInButton).toBeEnabled()
    return signInButton
}
test.describe('Duty sign-in error handling', () => {
    test('shows feedback when geolocation permission is denied', async ({ page }) => {
        await page.addInitScript(() => {
            const mockGeo = {
                getCurrentPosition: (_success: unknown, error?: (e: unknown) => void) => {
                    if (error) {
                        error({
                            code: 1,
                            message: 'Permission denied',
                            PERMISSION_DENIED: 1,
                            POSITION_UNAVAILABLE: 2,
                            TIMEOUT: 3,
                        })
                    }
                },
                watchPosition: () => 0,
                clearWatch: () => undefined,
            }
            Object.defineProperty(navigator, 'geolocation', {
                configurable: true,
                value: mockGeo,
            })
        })
        const signInButton = await openDutyWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(GEO_DENIED_REGEX)).toBeVisible()
    })
    test('shows feedback when geolocation returns empty payload', async ({ page }) => {
        await page.addInitScript(() => {
            const mockGeo = {
                getCurrentPosition: (success: (position: unknown) => void) => {
                    success(null)
                },
                watchPosition: () => 0,
                clearWatch: () => undefined,
            }
            Object.defineProperty(navigator, 'geolocation', {
                configurable: true,
                value: mockGeo,
            })
        })
        const signInButton = await openDutyWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(GEO_PAYLOAD_ERROR_REGEX)).toBeVisible()
    })
    test('shows feedback when duty_logs insert fails', async ({ page }) => {
        await page.addInitScript(() => {
            const mockGeo = {
                getCurrentPosition: (success: (position: unknown) => void) => {
                    success({
                        coords: {
                            latitude: 39.181074,
                            longitude: 117.121380,
                            accuracy: 1,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null,
                        },
                        timestamp: Date.now(),
                    })
                },
                watchPosition: () => 0,
                clearWatch: () => undefined,
            }
            Object.defineProperty(navigator, 'geolocation', {
                configurable: true,
                value: mockGeo,
            })
        })
        await page.route('**/rest/v1/duty_logs*', async (route, request) => {
            if (request.method() !== 'POST') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'mock duty_logs insert failed' }),
            })
        })
        const signInButton = await openDutyWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(SIGN_IN_ERROR_REGEX)).toBeVisible()
    })
    test('shows feedback when duty_logs request has network failure', async ({ page }) => {
        await page.addInitScript(() => {
            const mockGeo = {
                getCurrentPosition: (success: (position: unknown) => void) => {
                    success({
                        coords: {
                            latitude: 39.181074,
                            longitude: 117.121380,
                            accuracy: 1,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null,
                        },
                        timestamp: Date.now(),
                    })
                },
                watchPosition: () => 0,
                clearWatch: () => undefined,
            }
            Object.defineProperty(navigator, 'geolocation', {
                configurable: true,
                value: mockGeo,
            })
        })
        await page.route('**/rest/v1/duty_logs*', async (route, request) => {
            if (request.method() !== 'POST') {
                await route.continue()
                return
            }
            await route.abort('failed')
        })
        const signInButton = await openDutyWithEnabledSignIn(page)
        await signInButton.click()
        await expect(page.getByText(SIGN_IN_ERROR_REGEX)).toBeVisible()
    })
})

