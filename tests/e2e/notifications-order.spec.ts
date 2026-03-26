import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

test('notifications are sorted by priority', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/')

    await page.getByTestId('notification-trigger').click()

    const items = page.getByTestId('notification-item')
    const count = await items.count()
    test.skip(count < 2, 'Not enough notifications to verify sorting')

    const priority: Record<string, number> = {
        critical: 0,
        warning: 1,
        info: 2,
    }

    const levels: string[] = []
    for (let i = 0; i < count; i++) {
        const level = await items.nth(i).getAttribute('data-level')
        if (level && level in priority) {
            levels.push(level)
        }
    }

    test.skip(levels.length < 2, 'No priority-tagged notifications found')

    for (let i = 1; i < levels.length; i++) {
        expect(priority[levels[i]]).toBeGreaterThanOrEqual(priority[levels[i - 1]])
    }
})


