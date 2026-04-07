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

/**
 * 【学习注释：多候选成员的择优策略】
 * 历史数据里可能出现同邮箱对应多条成员记录，因此这里优先选 auth id 精确命中的记录，
 * 其次再按管理员优先和创建时间排序，尽量把“最可信的那一条”映射成前端用户。
 */
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

// 【学习注释：数据库信息缺失时的最小可用用户模型】
// 即使 members 表暂时没查到资料，前端也能先拿 auth 基础信息继续运行，避免整条登录链路被阻断。
export function fallbackAppUser(authUser: SupabaseAuthUser): AppUser {
    return {
        id: authUser.id,
        email: authUser.email || '',
        role: DEFAULT_MEMBER_ROLE,
        name: typeof authUser.user_metadata?.name === 'string' ? authUser.user_metadata.name : undefined,
    }
}

/**
 * 【学习注释：把 auth user 映射成业务用户】
 * Supabase Auth 只知道“这个人登录了”，但页面展示和权限判断还需要角色、姓名等业务字段。
 * 这个函数负责在认证层和业务层之间做一次整形，让后续组件统一消费 `AppUser`。
 */
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
            // 【学习注释：id 不命中时退回邮箱匹配】
            // 这是兼容历史数据迁移的策略，避免只靠 auth id 导致旧成员资料无法关联。
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
