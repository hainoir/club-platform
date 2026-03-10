import { expect, test } from '@playwright/test'
import { loginWithPassword, requireEnv } from './helpers/auth'

test('event RSVP toggle smoke', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await page.goto('/events')

    const rsvpButton = page.getByRole('button', { name: /立即报名|取消报名/ }).first()
    test.skip((await rsvpButton.count()) === 0, 'No RSVP-ready events found')

    const before = ((await rsvpButton.textContent()) || '').trim()
    await rsvpButton.click()

    const expectedLabel = before.includes('立即报名') ? /取消报名/ : /立即报名/
    await expect(page.getByRole('button', { name: expectedLabel }).first()).toBeVisible()
})
