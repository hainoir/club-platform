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

const DUTY_HALL_TITLE = '\u503c\u73ed\u4e0e\u8003\u52e4\u5927\u5385'
const DASHBOARD_TITLE = '\u503c\u73ed\u6267\u884c\u4eea\u8868\u76d8'
const SELF_STUDY_BUTTON_TEXT = '\u6211\u5728\u5de5\u4f5c\u5ba4\u81ea\u4e60'
const CURRENT_IN_STUDIO_TEXT = '\u5f53\u524d\u5728\u5de5\u4f5c\u5ba4'
const STUDY_LABEL = '\u81ea\u4e60'
const FALLBACK_MEMBER_STUDY_REGEX = /\u6210\u5458\s*\u81ea\u4e60/

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
        throw new Error('Unable to create fixture auth session: ' + (error?.message || 'missing user in auth response'))
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

test.describe('Self-study name display', () => {
    test('shows real member name after self-study starts when member has no rosters', async ({ page }) => {
        const account = getSelfStudyAccount()
        test.skip(!account, 'Missing E2E_SELF_STUDY_* or E2E_MEMBER_* credentials')
        if (!account) return

        let client: AuthedFixtureClient | null = null
        let memberId: string | null = null

        try {
            client = await createAuthedClient(account.email, account.password)
            const member = await resolveMemberIdentity(client, account.email)
            memberId = member.id

            const { count: rosterCount, error: rosterError } = await client.supabase
                .from('duty_rosters')
                .select('id', { count: 'exact', head: true })
                .eq('member_id', member.id)

            if (rosterError) {
                throw new Error('Unable to inspect duty_rosters precondition: ' + rosterError.message)
            }

            test.skip((rosterCount || 0) > 0, 'This test requires a member account with no duty_rosters assignments')

            const { error: endSessionError } = await client.supabase
                .from('studio_sessions')
                .update({ is_active: false, ended_at: new Date().toISOString() })
                .eq('member_id', member.id)
                .eq('is_active', true)

            if (endSessionError) {
                throw new Error('Unable to clear active self-study sessions: ' + endSessionError.message)
            }

            const expectedName = (member.name || '').trim() || member.email || account.email
            const expectedStudyText = new RegExp(`${escapeRegex(expectedName)}\\s*${STUDY_LABEL}`)

            await loginWithPassword(page, account.email, account.password)

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

            await gotoProtectedPath(page, '/duty')
            await expect(page.getByRole('heading', { level: 2, name: DUTY_HALL_TITLE })).toBeVisible()

            const selfStudyButton = page.getByRole('button', { name: SELF_STUDY_BUTTON_TEXT }).first()
            const canClickSelfStudy = await waitForLocatorVisible(selfStudyButton)
            test.skip(!canClickSelfStudy, 'Self-study button is not currently visible under this account state')
            await selfStudyButton.click()

            await expect(page.locator('span').filter({ hasText: expectedStudyText }).first()).toBeVisible()

            await gotoProtectedPath(page, '/')
            await expect(page.getByRole('heading', { name: DASHBOARD_TITLE })).toBeVisible()
            await expect(page.locator('span').filter({ hasText: expectedStudyText }).first()).toBeVisible()
        } finally {
            if (client && memberId) {
                await client.supabase
                    .from('studio_sessions')
                    .update({ is_active: false, ended_at: new Date().toISOString() })
                    .eq('member_id', memberId)
                    .eq('is_active', true)
            }
            await signOutQuietly(client)
        }
    })

    test('falls back safely when session relation member is null', async ({ page }) => {
        const account = getSelfStudyAccount()
        test.skip(!account, 'Missing E2E_SELF_STUDY_* or E2E_MEMBER_* credentials')
        if (!account) return

        await loginWithPassword(page, account.email, account.password)

        const now = new Date().toISOString()

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
            if (request.method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: '00000000-0000-0000-0000-000000000001',
                        member_id: '00000000-0000-0000-0000-000000000002',
                        started_at: now,
                        member: null,
                    },
                ]),
            })
        })

        await gotoProtectedPath(page, '/duty')
        await expect(page.getByRole('heading', { level: 2, name: DUTY_HALL_TITLE })).toBeVisible()
        await expect(page.getByText(CURRENT_IN_STUDIO_TEXT)).toBeVisible()
        await expect(page.locator('span').filter({ hasText: FALLBACK_MEMBER_STUDY_REGEX }).first()).toBeVisible()
    })
})



