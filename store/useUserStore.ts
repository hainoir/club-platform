import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const KNOWN_ROLES = [
    'admin',
    'member',
    '\u4e3b\u5e2d',
    '\u6267\u884c\u4e3b\u5e2d',
    '\u526f\u4e3b\u5e2d',
    '\u90e8\u957f',
    '\u5e72\u4e8b',
] as const

type KnownRole = (typeof KNOWN_ROLES)[number]

export type UserRole = KnownRole | null

export const ADMIN_ROLES: ReadonlyArray<string> = [
    'admin',
    '\u7ba1\u7406\u5458',
    '\u4e3b\u5e2d',
    '\u6267\u884c\u4e3b\u5e2d',
    '\u526f\u4e3b\u5e2d',
    '\u90e8\u957f',
]

const ROLE_SET = new Set<string>(KNOWN_ROLES as readonly string[])
const ADMIN_ROLE_SET = new Set<KnownRole>([
    'admin',
    '\u4e3b\u5e2d',
    '\u6267\u884c\u4e3b\u5e2d',
    '\u526f\u4e3b\u5e2d',
    '\u90e8\u957f',
])

const ROLE_ALIASES: Readonly<Record<string, KnownRole>> = {
    admin: 'admin',
    administrator: 'admin',
    '\u7ba1\u7406\u5458': 'admin',
    member: 'member',
    '\u6210\u5458': 'member',
    '\u4e3b\u5e2d': '\u4e3b\u5e2d',
    '\u6267\u884c\u4e3b\u5e2d': '\u6267\u884c\u4e3b\u5e2d',
    '\u526f\u4e3b\u5e2d': '\u526f\u4e3b\u5e2d',
    '\u90e8\u957f': '\u90e8\u957f',
    '\u5e72\u4e8b': '\u5e72\u4e8b',
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

interface User {
    id: string
    email: string
    role: UserRole
    name?: string
}

interface UserState {
    user: User | null
    isInitialized: boolean
    setUser: (user: User | null) => void
    setInitialized: (status: boolean) => void
    logout: () => void
}

export const useUserStore = create<UserState>()(
    persist(
        (set) => ({
            user: null,
            isInitialized: false,
            setUser: (user) => set({ user }),
            setInitialized: (status) => set({ isInitialized: status }),
            logout: () => set({ user: null, isInitialized: false }),
        }),
        {
            name: 'club-user-storage',
            partialize: (state) => ({ user: state.user }),
        }
    )
)
