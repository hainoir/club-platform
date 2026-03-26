import { expect, Page, test } from '@playwright/test'

const APP_ROUTE_READY_TIMEOUT_MS = 15_000
const SESSION_LOADING_TEXT = 'Checking session...'

export function requireEnv(keys: string[]): Record<string, string> {
    const missing = keys.filter((key) => !process.env[key])
    test.skip(missing.length > 0, `Missing required env vars: ${missing.join(', ')}`)

    const values: Record<string, string> = {}
    for (const key of keys) {
        values[key] = process.env[key] || ''
    }
    return values
}

export async function waitForProtectedAppReady(page: Page, timeoutMs = APP_ROUTE_READY_TIMEOUT_MS): Promise<void> {
    await expect
        .poll(
            async () => {
                const currentUrl = page.url()
                if (!currentUrl || currentUrl === 'about:blank') {
                    return false
                }

                const pathname = new URL(currentUrl).pathname
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
    await page.goto(path)
    await waitForProtectedAppReady(page, timeoutMs)
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
