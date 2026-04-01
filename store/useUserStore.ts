import { create } from 'zustand'
import type { AppUser } from '@/lib/app-user'
export { ADMIN_ROLES, DEFAULT_MEMBER_ROLE, isAdminRole, normalizeUserRole, type AppUser, type UserRole } from '@/lib/app-user'

interface UserState {
    user: AppUser | null
    isInitialized: boolean
    setUser: (user: AppUser | null) => void
    setInitialized: (status: boolean) => void
    logout: () => void
}

export const useUserStore = create<UserState>()((set) => ({
    user: null,
    isInitialized: false,
    setUser: (user) => set({ user }),
    setInitialized: (status) => set({ isInitialized: status }),
    logout: () => set({ user: null, isInitialized: false }),
}))
