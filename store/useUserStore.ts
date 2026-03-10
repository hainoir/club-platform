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
    '\u4e3b\u5e2d',
    '\u6267\u884c\u4e3b\u5e2d',
    '\u526f\u4e3b\u5e2d',
    '\u90e8\u957f',
]

const ROLE_SET = new Set<string>(KNOWN_ROLES as readonly string[])

export function normalizeUserRole(role: string | null | undefined): UserRole {
    if (!role) return null
    if (ROLE_SET.has(role)) return role as KnownRole
    return 'member'
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
            logout: () => set({ user: null }),
        }),
        {
            name: 'club-user-storage',
        }
    )
)
