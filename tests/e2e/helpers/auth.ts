import { expect, Page, test } from '@playwright/test'

const APP_ROUTE_READY_TIMEOUT_MS = 15_000
const SESSION_LOADING_TEXT = 'Checking session...'
const PROTECTED_NAV_MAX_ATTEMPTS = 4
const PROTECTED_NAV_READY_CHECK_TIMEOUT_MS = 3_500
const PROTECTED_NAV_BACKOFF_MS = [200, 500, 1_000]
const PROTECTED_STABILITY_WINDOW_MS = 1_000
const PROTECTED_STABILITY_POLL_INTERVAL_MS = 200
const APP_SHELL_MARKER_TEST_ID = 'notification-trigger'

export function requireEnv(keys: string[]): Record<string, string> {
    const missing = keys.filter((key) => !process.env[key])
    test.skip(missing.length > 0, `Missing required env vars: ${missing.join(', ')}`)

    const values: Record<string, string> = {}
    for (const key of keys) {
        values[key] = process.env[key] || ''
    }
    return values
}

function getPathname(value: string): string {
    return new URL(value, 'http://localhost').pathname
}

async function isLocatorVisible(page: Page, selector: string): Promise<boolean> {
    const locator = page.locator(selector).first()
    if ((await locator.count()) === 0) return false
    return locator.isVisible()
}

async function isNotificationTriggerVisible(page: Page): Promise<boolean> {
    const trigger = page.getByTestId(APP_SHELL_MARKER_TEST_ID).first()
    if ((await trigger.count()) === 0) return false
    return trigger.isVisible()
}

async function isLoginSurfaceVisible(page: Page): Promise<boolean> {
    if (getPathname(page.url()).startsWith('/login')) {
        return true
    }

    const hasEmail = await isLocatorVisible(page, '#email')
    const hasPassword = await isLocatorVisible(page, '#password')
    return hasEmail && hasPassword
}

async function isProtectedShellReady(page: Page): Promise<boolean> {
    const mainVisible = await isLocatorVisible(page, 'main')
    if (!mainVisible) return false

    if (await isNotificationTriggerVisible(page)) {
        return true
    }

    // Fallback for pages where notification trigger is absent, while still excluding login/guard blank states.
    return !(await isLoginSurfaceVisible(page))
}

async function isStableProtectedPath(
    page: Page,
    expectedPathname: string,
    stabilityWindowMs = PROTECTED_STABILITY_WINDOW_MS
): Promise<boolean> {
    const deadline = Date.now() + stabilityWindowMs

    while (Date.now() < deadline) {
        if (getPathname(page.url()) !== expectedPathname) {
            return false
        }

        if (await isLoginSurfaceVisible(page)) {
            return false
        }

        if (!(await isProtectedShellReady(page))) {
            return false
        }

        await page.waitForTimeout(PROTECTED_STABILITY_POLL_INTERVAL_MS)
    }

    return getPathname(page.url()) === expectedPathname && (await isProtectedShellReady(page))
}

export async function waitForProtectedAppReady(page: Page, timeoutMs = APP_ROUTE_READY_TIMEOUT_MS): Promise<void> {
    await expect
        .poll(
            async () => {
                const currentUrl = page.url()
                if (!currentUrl || currentUrl === 'about:blank') {
                    return false
                }

                const pathname = getPathname(currentUrl)
                if (pathname.startsWith('/login')) {
                    return false
                }

                if (await isLoginSurfaceVisible(page)) {
                    return false
                }

                if (await page.getByText(SESSION_LOADING_TEXT).isVisible()) {
                    return false
                }

                return await isProtectedShellReady(page)
            },
            {
                timeout: timeoutMs,
                intervals: [100, 250, 500, 1000],
            }
        )
        .toBe(true)
}

export async function gotoProtectedPath(page: Page, path: string, timeoutMs = APP_ROUTE_READY_TIMEOUT_MS): Promise<void> {
    const expectedPathname = getPathname(path)
    const readyTimeoutMs = Math.min(PROTECTED_NAV_READY_CHECK_TIMEOUT_MS, timeoutMs)

    for (let attempt = 0; attempt < PROTECTED_NAV_MAX_ATTEMPTS; attempt++) {
        await page.goto(path)

        try {
            await waitForProtectedAppReady(page, readyTimeoutMs)
        } catch {
            // Keep retrying while auth/session propagation catches up in CI.
        }

        if (getPathname(page.url()) === expectedPathname && (await isStableProtectedPath(page, expectedPathname))) {
            return
        }

        if (attempt < PROTECTED_NAV_MAX_ATTEMPTS - 1) {
            const backoffMs = PROTECTED_NAV_BACKOFF_MS[Math.min(attempt, PROTECTED_NAV_BACKOFF_MS.length - 1)]
            await page.waitForTimeout(backoffMs)
        }
    }

    await expect(page).toHaveURL(new RegExp(`${expectedPathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[?#].*)?$`), {
        timeout: timeoutMs,
    })
}

export async function loginWithPassword(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: /登录|log in|sign in/i }).click()

    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
    await waitForProtectedAppReady(page)
    await expect.poll(() => isProtectedShellReady(page), { timeout: 5_000, intervals: [100, 250, 500] }).toBe(true)
    await expect
        .poll(() => isStableProtectedPath(page, getPathname(page.url())), { timeout: 5_000, intervals: [100, 250, 500] })
        .toBe(true)
    await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/)
}
