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

export function isAdminRole(role: string | null | undefined): boolean {
    const normalized = normalizeUserRole(role)
    if (!normalized) return false
    return ADMIN_ROLE_SET.has(normalized)
}

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
