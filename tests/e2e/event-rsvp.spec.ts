import { expect, test } from '@playwright/test'
import { gotoProtectedPath, loginWithPassword } from './helpers/auth'

const SEEDED_MEMBER_EMAIL = 'E2E_MEMBER_EMAIL'
const SEEDED_MEMBER_PASSWORD = 'E2E_MEMBER_PASSWORD'
const SEEDED_EVENT_ID = '44444444-4444-4444-8444-444444444444'
const SEEDED_EVENT_TITLE = 'CI 报名活动'

function requireSeededMemberCredentials(): { email: string; password: string } {
    const email = process.env[SEEDED_MEMBER_EMAIL]
    const password = process.env[SEEDED_MEMBER_PASSWORD]
    if (!email || !password) {
        throw new Error(`Missing ${SEEDED_MEMBER_EMAIL} or ${SEEDED_MEMBER_PASSWORD}; run against the seeded E2E database`)
    }
    return { email, password }
}

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

test('seeded event RSVP can be toggled', async ({ page }) => {
    const credentials = requireSeededMemberCredentials()

    await loginWithPassword(page, credentials.email, credentials.password)
    await gotoProtectedPath(page, '/events')

    const targetCard = page
        .locator('div.flex.flex-col.overflow-hidden')
        .filter({ has: page.getByRole('heading', { name: SEEDED_EVENT_TITLE, exact: true }) })
        .first()
    await expect(targetCard).toHaveCount(1)
    await expect(targetCard.getByRole('link', { name: SEEDED_EVENT_TITLE, exact: true })).toHaveAttribute(
        'href',
        `/events/${SEEDED_EVENT_ID}`
    )

    const rsvpButton = targetCard.getByRole('button', { name: /立即报名|取消报名/ }).first()
    await expect(rsvpButton).toHaveCount(1)

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
    expect(observedMethod).toBe(expectedMethod)
    await expect(rsvpButton).toHaveText(expectedLabel)

    attendeeWriteMethod = null
    await rsvpButton.click()
    const reverseMethod = await waitForWriteMethod(() => attendeeWriteMethod)
    expect(reverseMethod).toBe(expectedMethod === 'POST' ? 'DELETE' : 'POST')
    await expect(rsvpButton).toHaveText(before)
})
