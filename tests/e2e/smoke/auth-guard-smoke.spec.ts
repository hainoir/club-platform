import { expect, test } from '@playwright/test'

test.describe('smoke: unauthenticated guards and login entry', () => {
    test('redirects unauthenticated users to /login on core protected routes', async ({ page }) => {
        const protectedRoutes = ['/', '/duty', '/members', '/events', '/settings']

        for (const route of protectedRoutes) {
            await page.goto(route)
            await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
        }
    })

    test('renders required login form fields', async ({ page }) => {
        await page.goto('/login')

        await expect(page.locator('#email')).toBeVisible()
        await expect(page.locator('#password')).toBeVisible()
        await expect(page.locator('form button[type="submit"]')).toBeVisible()
    })
})
