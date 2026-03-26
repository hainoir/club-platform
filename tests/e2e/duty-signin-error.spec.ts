import { expect, test, type Page } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'
const SIGN_IN_BUTTON_REGEX = /\u7ACB\u5373\u9A8C\u8BC1\u5B9A\u4F4D\u5E76\u7B7E\u5230|\u6B63\u5728\u96F7\u8FBE\u63A2\u8DDD\u4E0E\u9A8C\u8BC1/
const GEO_DENIED_REGEX = /\u5B9A\u4F4D\u6743\u9650\u88AB\u62D2\u7EDD|\u60A8\u62D2\u7EDD\u4E86\u5B9A\u4F4D\u8BF7\u6C42/
const GEO_PAYLOAD_ERROR_REGEX = /\u5B9A\u4F4D\u6570\u636E\u5F02\u5E38|\u672A\u83B7\u53D6\u5230\u6709\u6548\u5B9A\u4F4D\u4FE1\u606F|Location payload is empty|Sign-in failed/
const SIGN_IN_ERROR_REGEX = /\u7B7E\u5230\u8BB0\u5F55\u5931\u8D25|\u6253\u5361\u5B58\u6863\u5931\u8D25|\u7B7E\u5230\u5931\u8D25|mock duty_logs insert failed|Failed to fetch|fetch failed/i
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

