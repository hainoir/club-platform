import { expect, test } from '@playwright/test'

test.describe('Core access flow', () => {
    test('unauthenticated user is redirected to /login for protected routes', async ({ page }) => {
        const protectedRoutes = ['/', '/duty', '/members', '/events']

        for (const route of protectedRoutes) {
            await page.goto(route)
            await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
        }
    })

    test('login page renders required fields', async ({ page }) => {
        await page.goto('/login')

        await expect(page.locator('#email')).toBeVisible()
        await expect(page.locator('#password')).toBeVisible()
        await expect(page.getByRole('button', { name: /登录|log in|sign in/i })).toBeVisible()
    })
})
