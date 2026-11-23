/**
 * 【学习注释：业务层用户模型】
 * 认证系统只保证“用户存在”，而前端页面真正消费的是角色、姓名、邮箱这些业务字段。
 * 这一层把角色常量、归一化逻辑和权限判断放在一起，后续组件就不用各自重复处理脏数据。
 */
export const KNOWN_ROLES = [
    'admin',
    'member',
    '主席',
    '执行主席',
    '副主席',
    '部长',
    '干事',
] as const

export type KnownRole = (typeof KNOWN_ROLES)[number]
export type UserRole = KnownRole | null
export const DEFAULT_MEMBER_ROLE: KnownRole = '干事'

export interface AppUser {
    id: string
    email: string
    role: UserRole
    name?: string
}

export const ADMIN_ROLES: ReadonlyArray<string> = [
    'admin',
    '管理员',
    '主席',
    '执行主席',
    '副主席',
    '部长',
]

const ROLE_SET = new Set<string>(KNOWN_ROLES as readonly string[])
const ADMIN_ROLE_SET = new Set<KnownRole>([
    'admin',
    '主席',
    '执行主席',
    '副主席',
    '部长',
])

// 【学习注释：角色别名表】
// 历史数据和不同录入入口可能使用不同称呼，这里集中做一次映射，避免权限判断散落在各个页面里。
const ROLE_ALIASES: Readonly<Record<string, KnownRole>> = {
    admin: 'admin',
    administrator: 'admin',
    '管理员': 'admin',
    member: 'member',
    '成员': 'member',
    '主席': '主席',
    '执行主席': '执行主席',
    '副主席': '副主席',
    '部长': '部长',
    '干事': '干事',
}

function normalizeRoleInput(role: string | null | undefined): string {
    if (!role) return ''
    return role.trim()
}

/**
 * 【学习注释：角色归一化】
 * 组件层不应该直接相信数据库原始字符串，这里统一把别名、空值和大小写差异压缩成稳定的 `UserRole`。
 */
export function normalizeUserRole(role: string | null | undefined): UserRole {
    const trimmed = normalizeRoleInput(role)
    if (!trimmed) return null

    if (ROLE_SET.has(trimmed)) return trimmed as KnownRole

    const aliasByRaw = ROLE_ALIASES[trimmed]
    if (aliasByRaw) return aliasByRaw

    const aliasByLower = ROLE_ALIASES[trimmed.toLowerCase()]
    if (aliasByLower) return aliasByLower

    return 'member'
}

// 【学习注释：管理员判定】
// 权限判断统一建立在“归一化后的角色”之上，避免同一角色写法不同导致前后行为不一致。
export function isAdminRole(role: string | null | undefined): boolean {
    const normalized = normalizeUserRole(role)
    if (!normalized) return false
    return ADMIN_ROLE_SET.has(normalized)
}

// 【学习注释：用户对象浅比较】
// AuthProvider 和路由守卫会频繁同步用户状态，先做比较可以避免不必要的 store 写入和重复渲染。
export function areAppUsersEqual(left: AppUser | null | undefined, right: AppUser | null | undefined): boolean {
    if (!left && !right) return true
    if (!left || !right) return false

    return (
        left.id === right.id &&
        left.email === right.email &&
        left.role === right.role &&
        (left.name || '') === (right.name || '')
    )
}
