import { create } from 'zustand'
import type { AppUser } from '@/lib/app-user'
export { ADMIN_ROLES, DEFAULT_MEMBER_ROLE, isAdminRole, normalizeUserRole, type AppUser, type UserRole } from '@/lib/app-user'

/**
 * 【学习注释：全局登录态 store】
 * 这里的状态只保存“前端渲染立即需要”的用户信息和初始化标记，不重复保存 token。
 * token 仍交给 Supabase 管理，Zustand 负责把它转成页面能直接消费的轻量业务状态。
 */
interface UserState {
    user: AppUser | null
    isInitialized: boolean
    setUser: (user: AppUser | null) => void
    setInitialized: (status: boolean) => void
    logout: () => void
}

// 【学习注释：最小状态面】
// store 只暴露登录态读写和初始化控制，避免把鉴权细节泄漏到每个组件里。
export const useUserStore = create<UserState>()((set) => ({
    user: null,
    isInitialized: false,
    setUser: (user) => set({ user }),
    setInitialized: (status) => set({ isInitialized: status }),
    logout: () => set({ user: null, isInitialized: false }),
}))
