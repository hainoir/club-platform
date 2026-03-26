import { expect, Page, test } from '@playwright/test'

const APP_ROUTE_READY_TIMEOUT_MS = 15_000
const SESSION_LOADING_TEXT = 'Checking session...'
const PROTECTED_NAV_MAX_ATTEMPTS = 4
const PROTECTED_NAV_READY_CHECK_TIMEOUT_MS = 3_500
const PROTECTED_NAV_BACKOFF_MS = [200, 500, 1_000]

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

                return !(await page.getByText(SESSION_LOADING_TEXT).isVisible())
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

        if (getPathname(page.url()) === expectedPathname) {
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
    await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/)
}
