import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = string | null

// 【系统学习：集中式常量管理 (Constants)】
// 为了防止散落在项目各处的 Hardcode 字符串匹配（如 role === "admin"），
// 将核心的管理层角色收敛为一个数组。其他组件只需要 `ADMIN_ROLES.includes(role)` 即可判断权限。
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
            user: null, // 当前系统正在使用这个浏览器的操作人信息
            isInitialized: false, // 【性能考点】水合检测旗标：是否已经在这个客户端的生命周期内向 Supabase 查核过一次真实登录态
            setUser: (user) => set({ user }),
            setInitialized: (status) => set({ isInitialized: status }),
            logout: () => set({ user: null }),
        }),
        {
            name: 'club-user-storage',
            // 【系统学习：持久化状态 (Persist Middleware)】
            // 这个内置中间件使得每次你改变 user 时，Zustand 自动帮你把 JSON 数据塞进浏览器 localStorage。
            // 因此即使用户关掉浏览器再重新打开，他们上一次存入的名字和角色依然“存活”着跨标签页可用。
        }
    )
)
