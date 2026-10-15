import { expect, test, type Page } from '@playwright/test'
import { loginWithPassword, requireEnv } from './helpers/auth'

const AUTH_LOCK_NAME = 'lock:sb-127-auth-token'

async function authLockBusy(page: Page): Promise<boolean> {
    return page.evaluate(async (lockName) => {
        const state = await navigator.locks.query()
        const held = state.held ?? []
        const pending = state.pending ?? []
        return [...held, ...pending].some((lock) => lock.name === lockName)
    }, AUTH_LOCK_NAME)
}

test.describe('auth lock after a full reload', () => {
    test.setTimeout(60_000)

    test('reload releases the auth lock and a roster write is not stuck behind it', async ({ page }) => {
        const env = requireEnv(['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'])

        await loginWithPassword(page, env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD)
        await page.goto('/duty', { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { name: '值班管理' })).toBeVisible({ timeout: 20_000 })

        await expect.poll(() => authLockBusy(page), { timeout: 3_000, intervals: [200, 500, 1000] }).toBe(false)

        const cell = page.getByRole('row', { name: /第一大节/ }).getByRole('cell').nth(1)
        const alreadyAssigned = cell.getByText('E2E 成员', { exact: true })
        const rosterWrite = page.waitForResponse(
            (response) => {
                const method = response.request().method()
                return response.url().includes('/rest/v1/duty_rosters') && (method === 'POST' || method === 'DELETE')
            },
            { timeout: 8_000 }
        )

        if (await alreadyAssigned.count()) {
            await cell.getByRole('button', { name: '移除 E2E 成员' }).click()
        } else {
            await cell.getByRole('button', { name: '指派成员' }).click()
            await page.getByPlaceholder('搜索姓名或学号...').fill('E2E 成员')
            await page.getByRole('button', { name: 'E2E 成员', exact: true }).click()
        }

        const response = await rosterWrite
        expect(response.ok()).toBe(true)
    })
})
