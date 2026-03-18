import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../types/supabase'
type AppSupabaseClient = SupabaseClient<Database>
interface MemberIdentity {
    id: string
    name: string | null
    email: string | null
}
interface AcceptedSwapFixture {
    swapId: string
    requesterName: string
    originalDay: number
    originalPeriod: number
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
async function createAuthedClient(email: string, password: string): Promise<AppSupabaseClient> {
    const { url, anonKey } = getSupabaseEnv()
    const supabase = createClient<Database>(url, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
        throw new Error('Unable to create fixture auth session: ' + error.message)
    }
    return supabase
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
export async function createAcceptedSwapFixtureForAdmin(adminEmail: string, adminPassword: string): Promise<AcceptedSwapFixture> {
    const supabase = await createAuthedClient(adminEmail, adminPassword)
    const admin = await findMemberByEmail(supabase, adminEmail)
    // 先清理该发起人历史上的“已应答”记录，保证测试选择器稳定可复现。
    const { error: cleanupError } = await supabase
        .from('duty_swaps')
        .delete()
        .eq('requester_id', admin.id)
        .eq('status', 'accepted')
    if (cleanupError) {
        await supabase.auth.signOut()
        throw new Error('Unable to clean accepted swap fixtures: ' + cleanupError.message)
    }
    const originalDay = 1
    const originalPeriod = 1
    const { data, error } = await supabase
        .from('duty_swaps')
        .insert({
            requester_id: admin.id,
            target_id: admin.id,
            original_day: originalDay,
            original_period: originalPeriod,
            status: 'accepted',
        })
        .select('id')
        .single()
    if (error || !data) {
        await supabase.auth.signOut()
        throw new Error('Unable to create accepted swap fixture: ' + (error?.message || 'unknown error'))
    }
    const cleanup = async () => {
        await supabase.from('duty_swaps').delete().eq('id', data.id)
        await supabase.auth.signOut()
    }
    return {
        swapId: data.id,
        requesterName: admin.name || admin.email || adminEmail,
        originalDay,
        originalPeriod,
        cleanup,
    }
}
export async function createPendingKeyTransferFixtureForReceiver(
    receiverEmail: string,
    receiverPassword: string
): Promise<PendingKeyTransferFixture> {
    const supabase = await createAuthedClient(receiverEmail, receiverPassword)
    const receiver = await findMemberByEmail(supabase, receiverEmail)
    const note = 'E2E-RPC-FIXTURE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const { data, error } = await supabase
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
        await supabase.auth.signOut()
        throw new Error('Unable to create key-transfer fixture: ' + (error?.message || 'unknown error'))
    }
    const cleanup = async () => {
        await supabase
            .from('key_transfers')
            .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
            .eq('id', data.id)
        await supabase.auth.signOut()
    }
    return {
        transferId: data.id,
        note: data.note || note,
        cleanup,
    }
}
