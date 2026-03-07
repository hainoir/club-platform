import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = string | null

export const ADMIN_ROLES = ["admin", "主席", "执行主席", "副主席", "部长"];

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
            isInitialized: false, // 是否已经检查过一次登录态
            setUser: (user) => set({ user }),
            setInitialized: (status) => set({ isInitialized: status }),
            logout: () => set({ user: null }),
        }),
        {
            name: 'club-user-storage',
            // 默认存在 localStorage 中跨标签页共享
        }
    )
)
