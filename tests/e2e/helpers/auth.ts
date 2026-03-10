import { expect, Page, test } from '@playwright/test'

export function requireEnv(keys: string[]): Record<string, string> {
    const missing = keys.filter((key) => !process.env[key])
    test.skip(missing.length > 0, `Missing required env vars: ${missing.join(', ')}`)

    const values: Record<string, string> = {}
    for (const key of keys) {
        values[key] = process.env[key] || ''
    }
    return values
}

export async function loginWithPassword(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: /登录|log in|sign in/i }).click()

    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
    await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/)
}
