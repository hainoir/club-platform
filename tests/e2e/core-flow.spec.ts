import { expect, test } from '@playwright/test'

test.describe('Core access flow', () => {
    test('unauthenticated user is redirected to /login for protected routes', async ({ page }) => {
        const protectedRoutes = ['/', '/duty', '/members', '/events', '/settings']

        for (const route of protectedRoutes) {
            await page.goto(route)
            await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
        }
    })

    test('login page renders required fields', async ({ page }) => {
        await page.goto('/login')

        await expect(page.locator('#email')).toBeVisible()
        await expect(page.locator('#password')).toBeVisible()
        await expect(page.locator('form button[type="submit"]')).toBeVisible()
    })
})
