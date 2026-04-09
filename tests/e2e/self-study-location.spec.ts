import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Locator } from '@playwright/test'

import type { Database } from '../../types/supabase'
import { gotoProtectedPath, loginWithPassword } from './helpers/auth'

type AppSupabaseClient = SupabaseClient<Database>

interface AuthedFixtureClient {
    supabase: AppSupabaseClient
    authUserId: string
}

interface MemberIdentity {
    id: string
    name: string | null
    email: string | null
}

const DUTY_HALL_TITLE = '值班与考勤大厅'
const SELF_STUDY_BUTTON_TEXT = '我在工作室自习'
const LOCATION_DENIED_REGEX = /定位权限被拒绝|无法完成位置验证/
const LOCATION_ACCURACY_REGEX = /当前定位精度约\s*200\s*米/

function getSupabaseEnv() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for e2e fixtures')
    }
    return { url, anonKey }
}

function getSelfStudyAccount() {
    const email = process.env.E2E_SELF_STUDY_EMAIL || process.env.E2E_MEMBER_EMAIL
    const password = process.env.E2E_SELF_STUDY_PASSWORD || process.env.E2E_MEMBER_PASSWORD
    if (!email || !password) return null
    return { email, password }
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function waitForLocatorVisible(locator: Locator, timeoutMs = 15_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const count = await locator.count()
        if (count > 0 && (await locator.first().isVisible())) {
            return true
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return false
}

async function createAuthedClient(email: string, password: string): Promise<AuthedFixtureClient> {
    const { url, anonKey } = getSupabaseEnv()
    const supabase = createClient<Database>(url, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
        throw new Error('Unable to create fixture auth session: ' + (error?.message || 'missing user'))
    }

    return {
        supabase,
        authUserId: data.user.id,
    }
}

async function signOutQuietly(client: AuthedFixtureClient | null): Promise<void> {
    if (!client) return
    await client.supabase.auth.signOut()
}

async function findMemberByAuthId(supabase: AppSupabaseClient, authUserId: string): Promise<MemberIdentity | null> {
    const { data, error } = await supabase
        .from('members')
        .select('id, name, email')
        .eq('id', authUserId)
        .maybeSingle()

    if (error) {
        throw new Error('Unable to resolve member by auth id: ' + error.message)
    }

    return data ?? null
}

async function findMemberByEmail(supabase: AppSupabaseClient, email: string): Promise<MemberIdentity> {
    const { data, error } = await supabase
        .from('members')
        .select('id, name, email')
        .ilike('email', email)
        .limit(1)
        .maybeSingle()

    if (error || !data) {
        throw new Error('Unable to resolve member by email: ' + email)
    }

    return data
}

async function resolveMemberIdentity(client: AuthedFixtureClient, fallbackEmail: string): Promise<MemberIdentity> {
    const byAuthId = await findMemberByAuthId(client.supabase, client.authUserId)
    if (byAuthId) return byAuthId
    return findMemberByEmail(client.supabase, fallbackEmail)
}

async function resolveEligibleSelfStudyMember() {
    const account = getSelfStudyAccount()
    test.skip(!account, 'Missing E2E_SELF_STUDY_* or E2E_MEMBER_* credentials')
    if (!account) {
        throw new Error('Missing self-study test account')
    }

    const client = await createAuthedClient(account.email, account.password)
    const member = await resolveMemberIdentity(client, account.email)
    const expectedName = (member.name || '').trim() || member.email || account.email

    const { count: rosterCount, error: rosterError } = await client.supabase
        .from('duty_rosters')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', member.id)

    if (rosterError) {
        throw new Error('Unable to inspect duty_rosters precondition: ' + rosterError.message)
    }

    test.skip((rosterCount || 0) > 0, 'This test requires a member account with no duty_rosters assignments')

    return {
        account,
        client,
        member,
        expectedName,
    }
}

async function openDutyWithSelfStudyReady(page: import('@playwright/test').Page) {
    const setup = await resolveEligibleSelfStudyMember()
    await loginWithPassword(page, setup.account.email, setup.account.password)
    await gotoProtectedPath(page, '/duty')
    await expect(page.getByRole('heading', { level: 2, name: DUTY_HALL_TITLE })).toBeVisible({ timeout: 45_000 })

    const selfStudyButton = page.getByRole('button', { name: SELF_STUDY_BUTTON_TEXT }).first()
    const canClickSelfStudy = await waitForLocatorVisible(selfStudyButton)
    test.skip(!canClickSelfStudy, 'Self-study button is not currently visible under this account state')
    await expect(selfStudyButton).toBeVisible()

    return {
        ...setup,
        selfStudyButton,
    }
}

test.describe('Self-study location gating', () => {
    test.setTimeout(90_000)

    test('starts self-study only after location validation succeeds', async ({ page }) => {
        let client: AuthedFixtureClient | null = null

        try {
            await page.addInitScript(() => {
                const mockGeo = {
                    getCurrentPosition: (success: (position: unknown) => void) => {
                        success({
                            coords: {
                                latitude: 39.181074,
                                longitude: 117.12138,
                                accuracy: 1,
                                altitude: null,
                                altitudeAccuracy: null,
                                heading: null,
                                speed: null,
                            },
                            timestamp: Date.now(),
                        })
                    },
                    watchPosition: () => 0,
                    clearWatch: () => undefined,
                }

                Object.defineProperty(navigator, 'geolocation', {
                    configurable: true,
                    value: mockGeo,
                })
            })

            let hasActiveStudy = false
            let postRequests = 0
            let expectedName = ''
            let memberId = ''

            await page.route('**/rest/v1/duty_logs*', async (route, request) => {
                if (request.method() !== 'GET') {
                    await route.continue()
                    return
                }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: '[]',
                })
            })

            await page.route('**/rest/v1/studio_sessions*', async (route, request) => {
                if (request.method() === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: hasActiveStudy
                            ? JSON.stringify([
                                  {
                                      id: '00000000-0000-0000-0000-000000000031',
                                      member_id: memberId,
                                      started_at: new Date().toISOString(),
                                      member: {
                                          id: memberId,
                                          name: expectedName,
                                      },
                                  },
                              ])
                            : '[]',
                    })
                    return
                }

                if (request.method() === 'POST') {
                    postRequests += 1
                    hasActiveStudy = true
                    await route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: '[]',
                    })
                    return
                }

                await route.continue()
            })

            const setup = await openDutyWithSelfStudyReady(page)
            client = setup.client
            expectedName = setup.expectedName
            memberId = setup.member.id

            await setup.selfStudyButton.click()
            await expect.poll(() => postRequests, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(1)

            const studyBadge = page.locator('span').filter({ hasText: new RegExp(`${escapeRegex(expectedName)}\\s*自习`) }).first()
            await expect(studyBadge).toBeVisible({ timeout: 15_000 })
        } finally {
            await signOutQuietly(client)
        }
    })

    test('does not create a self-study session when location permission is denied', async ({ page }) => {
        let client: AuthedFixtureClient | null = null

        try {
            await page.addInitScript(() => {
                const mockGeo = {
                    getCurrentPosition: (_success: unknown, error?: (e: unknown) => void) => {
                        error?.({
                            code: 1,
                            message: 'Permission denied',
                            PERMISSION_DENIED: 1,
                            POSITION_UNAVAILABLE: 2,
                            TIMEOUT: 3,
                        })
                    },
                    watchPosition: () => 0,
                    clearWatch: () => undefined,
                }

                Object.defineProperty(navigator, 'geolocation', {
                    configurable: true,
                    value: mockGeo,
                })
            })

            let postRequests = 0

            await page.route('**/rest/v1/duty_logs*', async (route, request) => {
                if (request.method() !== 'GET') {
                    await route.continue()
                    return
                }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: '[]',
                })
            })

            await page.route('**/rest/v1/studio_sessions*', async (route, request) => {
                if (request.method() === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: '[]',
                    })
                    return
                }

                if (request.method() === 'POST') {
                    postRequests += 1
                    await route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: '[]',
                    })
                    return
                }

                await route.continue()
            })

            const setup = await openDutyWithSelfStudyReady(page)
            client = setup.client

            await setup.selfStudyButton.click()
            await expect(page.getByText(LOCATION_DENIED_REGEX)).toBeVisible({ timeout: 15_000 })
            await page.waitForTimeout(500)
            expect(postRequests).toBe(0)
        } finally {
            await signOutQuietly(client)
        }
    })

    test('does not create a self-study session when location accuracy is insufficient', async ({ page }) => {
        let client: AuthedFixtureClient | null = null

        try {
            await page.addInitScript(() => {
                const mockGeo = {
                    getCurrentPosition: (success: (position: unknown) => void) => {
                        success({
                            coords: {
                                latitude: 39.181074,
                                longitude: 117.12138,
                                accuracy: 200,
                                altitude: null,
                                altitudeAccuracy: null,
                                heading: null,
                                speed: null,
                            },
                            timestamp: Date.now(),
                        })
                    },
                    watchPosition: () => 0,
                    clearWatch: () => undefined,
                }

                Object.defineProperty(navigator, 'geolocation', {
                    configurable: true,
                    value: mockGeo,
                })
            })

            let postRequests = 0

            await page.route('**/rest/v1/duty_logs*', async (route, request) => {
                if (request.method() !== 'GET') {
                    await route.continue()
                    return
                }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: '[]',
                })
            })

            await page.route('**/rest/v1/studio_sessions*', async (route, request) => {
                if (request.method() === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: '[]',
                    })
                    return
                }

                if (request.method() === 'POST') {
                    postRequests += 1
                    await route.fulfill({
                        status: 201,
                        contentType: 'application/json',
                        body: '[]',
                    })
                    return
                }

                await route.continue()
            })

            const setup = await openDutyWithSelfStudyReady(page)
            client = setup.client

            await setup.selfStudyButton.click()
            await expect(page.getByText(LOCATION_ACCURACY_REGEX)).toBeVisible({ timeout: 15_000 })
            await page.waitForTimeout(500)
            expect(postRequests).toBe(0)
        } finally {
            await signOutQuietly(client)
        }
    })
})
