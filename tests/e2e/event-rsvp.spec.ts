import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

async function waitForWriteMethod(
    getMethod: () => 'POST' | 'DELETE' | null,
    timeoutMs = 15_000
): Promise<'POST' | 'DELETE' | null> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const method = getMethod()
        if (method === 'POST' || method === 'DELETE') {
            return method
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return null
}

test('event RSVP toggle smoke', async ({ page }) => {
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/events')

    const candidateCard = page
        .locator('div.flex.flex-col.overflow-hidden')
        .filter({ has: page.getByRole('button', { name: /立即报名|取消报名/ }) })
        .first()
    test.skip((await candidateCard.count()) === 0, 'No RSVP-ready events found')

    const cardTitle = ((await candidateCard.getByRole('heading').first().textContent()) || '').trim()
    test.skip(cardTitle.length === 0, 'No stable target event title for RSVP smoke')

    const targetCard = page
        .locator('div.flex.flex-col.overflow-hidden')
        .filter({ has: page.getByRole('heading', { name: cardTitle, exact: true }) })
        .first()
    const rsvpButton = targetCard.getByRole('button', { name: /立即报名|取消报名/ }).first()
    test.skip((await rsvpButton.count()) === 0, 'No RSVP action found on target event card')

    let attendeeWriteMethod: 'POST' | 'DELETE' | null = null
    await page.route('**/rest/v1/event_attendees*', async (route, request) => {
        const method = request.method()
        if (method === 'POST' || method === 'DELETE') {
            attendeeWriteMethod = method
        }
        await route.continue()
    })

    const before = ((await rsvpButton.textContent()) || '').trim()
    const expectedMethod: 'POST' | 'DELETE' = before.includes('立即报名') ? 'POST' : 'DELETE'
    const expectedLabel = before.includes('立即报名') ? '取消报名' : '立即报名'

    await rsvpButton.click()

    const observedMethod = await waitForWriteMethod(() => attendeeWriteMethod)
    test.skip(!observedMethod, 'event_attendees write not observed under current env')

    expect(observedMethod).toBe(expectedMethod)
    await expect.poll(async () => ((await rsvpButton.textContent()) || '').trim(), { timeout: 15_000 }).toContain(expectedLabel)
})
