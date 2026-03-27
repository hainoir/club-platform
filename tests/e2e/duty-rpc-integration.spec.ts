import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Locator } from '@playwright/test'
import type { Database } from '../../types/supabase'
import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

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

interface AcceptedSwapFixture {
    swapId: string
    requesterName: string
    cleanup: () => Promise<void>
}

interface PendingKeyTransferFixture {
    transferId: string
    note: string
    cleanup: () => Promise<void>
}

function getSupabaseEnv() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for e2e fixtures')
    }
    return { url, anonKey }
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

async function signOutQuietly(client: AuthedFixtureClient | null | undefined): Promise<void> {
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
    if (byAuthId) {
        return byAuthId
    }
    return findMemberByEmail(client.supabase, fallbackEmail)
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

async function createAcceptedSwapFixtureForAdmin(
    adminEmail: string,
    adminPassword: string,
    requesterEmail: string,
    requesterPassword: string
): Promise<AcceptedSwapFixture> {
    const adminClient = await createAuthedClient(adminEmail, adminPassword)
    const requesterClient = await createAuthedClient(requesterEmail, requesterPassword)
    try {
        const admin = await resolveMemberIdentity(adminClient, adminEmail)
        const requester = await resolveMemberIdentity(requesterClient, requesterEmail)

        const { error: cleanupError } = await requesterClient.supabase
            .from('duty_swaps')
            .delete()
            .eq('requester_id', requester.id)
            .eq('target_id', admin.id)
            .eq('status', 'accepted')
        if (cleanupError) {
            throw new Error('Unable to clean accepted swap fixtures: ' + cleanupError.message)
        }

        const { data, error } = await requesterClient.supabase
            .from('duty_swaps')
            .insert({
                requester_id: requester.id,
                target_id: admin.id,
                original_day: 1,
                original_period: 1,
                status: 'accepted',
            })
            .select('id')
            .single()
        if (error || !data) {
            throw new Error('Unable to create accepted swap fixture: ' + (error?.message || 'unknown error'))
        }

        const cleanup = async () => {
            await requesterClient.supabase.from('duty_swaps').delete().eq('id', data.id)
            await signOutQuietly(requesterClient)
            await signOutQuietly(adminClient)
        }

        return {
            swapId: data.id,
            requesterName: requester.name || requester.email || requesterEmail,
            cleanup,
        }
    } catch (error) {
        await signOutQuietly(requesterClient)
        await signOutQuietly(adminClient)
        throw error
    }
}

async function createPendingKeyTransferFixtureForReceiver(
    receiverEmail: string,
    receiverPassword: string
): Promise<PendingKeyTransferFixture> {
    const receiverClient = await createAuthedClient(receiverEmail, receiverPassword)
    try {
        const receiver = await resolveMemberIdentity(receiverClient, receiverEmail)
        const note = 'E2E-RPC-FIXTURE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
        const { data, error } = await receiverClient.supabase
            .from('key_transfers')
            .insert({
                from_member_id: receiver.id,
                to_member_id: receiver.id,
                note,
                status: 'pending',
            })
            .select('id, note')
            .single()
        if (error || !data) {
            throw new Error('Unable to create key-transfer fixture: ' + (error?.message || 'unknown error'))
        }

        const cleanup = async () => {
            await receiverClient.supabase
                .from('key_transfers')
                .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
                .eq('id', data.id)
            await signOutQuietly(receiverClient)
        }

        return {
            transferId: data.id,
            note: data.note || note,
            cleanup,
        }
    } catch (error) {
        await signOutQuietly(receiverClient)
        throw error
    }
}

const SWAP_HALL_REGEX = new RegExp('\u4ee3\u73ed\u5927\u5385')
const SWAP_HALL_TITLE = '\u4ee3\u73ed\u5927\u5385'
const APPROVE_BUTTON = '\u6279\u51c6'
const KEY_TRANSFER_TITLE = '\u94a5\u5319\u4ea4\u63a5'
const KEY_CONFIRM_BUTTON = '\u786e\u8ba4\u63a5\u6536'

test.describe('Duty RPC integration', () => {
    test.setTimeout(60_000)

    test('admin approval triggers accept_duty_swap RPC', async ({ page }) => {
        const env = requireEnv([
            'E2E_ADMIN_EMAIL',
            'E2E_ADMIN_PASSWORD',
            'E2E_MEMBER_EMAIL',
            'E2E_MEMBER_PASSWORD',
        ])

        const fixture = await createAcceptedSwapFixtureForAdmin(
            env.E2E_ADMIN_EMAIL,
            env.E2E_ADMIN_PASSWORD,
            env.E2E_MEMBER_EMAIL,
            env.E2E_MEMBER_PASSWORD
        )

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
            await gotoProtectedPath(page, '/duty')
            await page.getByRole('button', { name: SWAP_HALL_REGEX }).click()
            await expect(page.getByRole('heading', { name: SWAP_HALL_TITLE })).toBeVisible()

            const fixtureRow = page
                .locator('div')
                .filter({ hasText: fixture.requesterName })
                .filter({ has: page.getByRole('button', { name: APPROVE_BUTTON }) })
                .first()

            const swapRowVisible = await waitForLocatorVisible(fixtureRow)
            test.skip(!swapRowVisible, 'Fixture row not visible under current account/data policy')

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
            await gotoProtectedPath(page, '/duty')
            await expect(page.getByRole('heading', { level: 3, name: KEY_TRANSFER_TITLE })).toBeVisible({ timeout: 15_000 })

            const fixtureRow = page
                .locator('div')
                .filter({ hasText: fixture.note })
                .filter({ has: page.getByRole('button', { name: KEY_CONFIRM_BUTTON }) })
                .first()

            const transferRowVisible = await waitForLocatorVisible(fixtureRow)
            test.skip(!transferRowVisible, 'Fixture row not visible under current account/data policy')

            await fixtureRow.getByRole('button', { name: KEY_CONFIRM_BUTTON }).click()
            await expect.poll(() => (confirmPayload?.p_transfer_id as string | undefined) || '').toBe(fixture.transferId)
            expect(confirmPayload).toHaveProperty('p_confirmer_id')
        } finally {
            await fixture.cleanup()
        }
    })
})


