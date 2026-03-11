import { expect, test } from '@playwright/test'
import { loginWithPassword, requireEnv } from './helpers/auth'
import {
    createAcceptedSwapFixtureForAdmin,
    createPendingKeyTransferFixtureForReceiver,
} from './helpers/duty-fixtures'
const SWAP_HALL_REGEX = new RegExp('\u4ee3\u73ed\u5927\u5385')
const SWAP_HALL_TITLE = '\u4ee3\u73ed\u5927\u5385'
const APPROVE_BUTTON = '\u6279\u51c6'
const KEY_TRANSFER_TITLE = '\u94a5\u5319\u4ea4\u63a5'
const KEY_CONFIRM_BUTTON = '\u786e\u8ba4\u63a5\u6536'
test.describe('Duty RPC integration', () => {
    test('admin approval triggers accept_duty_swap RPC', async ({ page }) => {
        const env = requireEnv(['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'])
        const fixture = await createAcceptedSwapFixtureForAdmin(env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD)
        let acceptPayload: Record<string, unknown> | null = null
        try {
            await page.route('**/rest/v1/rpc/accept_duty_swap', async (route, request) => {
                if (request.method() !== 'POST') {
                    await route.continue()
                    return
                }
                acceptPayload = request.postDataJSON() as Record<string, unknown>
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: 'null',
                })
            })
            await loginWithPassword(page, env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD)
            await page.goto('/duty')
            await page.getByRole('button', { name: SWAP_HALL_REGEX }).click()
            await expect(page.getByRole('heading', { name: SWAP_HALL_TITLE })).toBeVisible()
            const fixtureRow = page
                .locator('div.rounded-md.border.text-sm')
                .filter({ hasText: fixture.requesterName })
                .filter({ has: page.getByRole('button', { name: APPROVE_BUTTON }) })
                .first()
            await expect(fixtureRow).toBeVisible({ timeout: 15000 })
            await fixtureRow.getByRole('button', { name: APPROVE_BUTTON }).click()
            await expect.poll(() => (acceptPayload?.p_swap_id as string | undefined) || '').toBe(fixture.swapId)
            expect(acceptPayload).toHaveProperty('p_acceptor_id')
        } finally {
            await fixture.cleanup()
        }
    })
    test('receiver confirmation triggers confirm_key_transfer RPC', async ({ page }) => {
        const env = requireEnv(['E2E_KEY_RECEIVER_EMAIL', 'E2E_KEY_RECEIVER_PASSWORD'])
        const fixture = await createPendingKeyTransferFixtureForReceiver(
            env.E2E_KEY_RECEIVER_EMAIL,
            env.E2E_KEY_RECEIVER_PASSWORD
        )
        let confirmPayload: Record<string, unknown> | null = null
        try {
            await page.route('**/rest/v1/rpc/confirm_key_transfer', async (route, request) => {
                if (request.method() !== 'POST') {
                    await route.continue()
                    return
                }
                confirmPayload = request.postDataJSON() as Record<string, unknown>
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: 'null',
                })
            })
            await loginWithPassword(page, env.E2E_KEY_RECEIVER_EMAIL, env.E2E_KEY_RECEIVER_PASSWORD)
            await page.goto('/duty')
            await expect(page.getByRole('heading', { level: 3, name: KEY_TRANSFER_TITLE })).toBeVisible()
            const fixtureRow = page
                .locator('div')
                .filter({ hasText: fixture.note })
                .filter({ has: page.getByRole('button', { name: KEY_CONFIRM_BUTTON }) })
                .first()
            await expect(fixtureRow).toBeVisible({ timeout: 15000 })
            await fixtureRow.getByRole('button', { name: KEY_CONFIRM_BUTTON }).click()
            await expect.poll(() => (confirmPayload?.p_transfer_id as string | undefined) || '').toBe(fixture.transferId)
            expect(confirmPayload).toHaveProperty('p_confirmer_id')
        } finally {
            await fixture.cleanup()
        }
    })
})