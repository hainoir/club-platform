import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { DEFAULT_MEMBER_ROLE, isAdminRole, normalizeUserRole, type AppUser } from '@/lib/app-user'

type MemberLookupRow = {
    id: string
    role: string | null
    name: string | null
    created_at: string
}

function rankRolePriority(role: string | null): number {
    return isAdminRole(role) ? 0 : 1
}

function pickPreferredMember(candidates: MemberLookupRow[], authUserId: string): MemberLookupRow | null {
    if (candidates.length === 0) return null

    const exactMatch = candidates.find((candidate) => candidate.id === authUserId)
    if (exactMatch) return exactMatch

    const sorted = [...candidates].sort((left, right) => {
        const roleDiff = rankRolePriority(left.role) - rankRolePriority(right.role)
        if (roleDiff !== 0) return roleDiff

        const leftTime = Date.parse(left.created_at || '') || 0
        const rightTime = Date.parse(right.created_at || '') || 0
        return rightTime - leftTime
    })

    return sorted[0] ?? null
}

export function fallbackAppUser(authUser: SupabaseAuthUser): AppUser {
    return {
        id: authUser.id,
        email: authUser.email || '',
        role: DEFAULT_MEMBER_ROLE,
        name: typeof authUser.user_metadata?.name === 'string' ? authUser.user_metadata.name : undefined,
    }
}

export async function resolveAppUser(
    supabase: SupabaseClient<Database>,
    authUser: SupabaseAuthUser | null | undefined
): Promise<AppUser | null> {
    if (!authUser) {
        return null
    }

    const fallbackUser = fallbackAppUser(authUser)

    try {
        let memberData: MemberLookupRow | null = null

        const byIdResult = await supabase
            .from('members')
            .select('id, role, name, created_at')
            .eq('id', authUser.id)
            .maybeSingle()

        if (byIdResult.data) {
            memberData = byIdResult.data
        }

        if (!memberData && authUser.email) {
            const byEmailResult = await supabase
                .from('members')
                .select('id, role, name, created_at')
                .ilike('email', authUser.email)
                .order('created_at', { ascending: false })
                .limit(20)

            memberData = pickPreferredMember(byEmailResult.data || [], authUser.id)
        }

        if (!memberData) {
            return fallbackUser
        }

        return {
            id: memberData.id,
            email: authUser.email || '',
            role: normalizeUserRole(memberData.role),
            name: memberData.name ?? undefined,
        }
    } catch {
        return fallbackUser
    }
}
