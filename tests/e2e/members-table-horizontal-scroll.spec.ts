import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

test('members table scrolls horizontally on narrow screens', async ({ page }) => {
    test.setTimeout(60_000)
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await page.setViewportSize({ width: 430, height: 932 })
    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/members')

    const table = page.locator('main table').first()
    await expect(table).toBeVisible({ timeout: 45_000 })

    const scrollViewport = table.locator('xpath=..')
    const dimensions = await scrollViewport.evaluate((node) => {
        const element = node as HTMLDivElement

        return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
        }
    })

    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)

    const scrollLeft = await scrollViewport.evaluate((node) => {
        const element = node as HTMLDivElement
        element.scrollLeft = 160
        return element.scrollLeft
    })

    expect(scrollLeft).toBeGreaterThan(0)
})
