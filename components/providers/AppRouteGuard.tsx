"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { areAppUsersEqual, type AppUser } from "@/lib/app-user"
import { useUserStore } from "@/store/useUserStore"

/**
 * 【学习注释：客户端路由守卫】
 * 服务端布局会把首屏解析好的 `initialUser` 传进来，这个组件负责把它同步到 Zustand，
 * 并在客户端继续兜底未登录跳转。面试时可以把它描述成“服务端预判 + 客户端收口”的双保险。
 */
export function AppRouteGuard({
    children,
    initialUser,
}: {
    children: React.ReactNode
    initialUser: AppUser | null
}) {
    const router = useRouter()
    const user = useUserStore((state) => state.user)
    const isInitialized = useUserStore((state) => state.isInitialized)
    const setUser = useUserStore((state) => state.setUser)
    const setInitialized = useUserStore((state) => state.setInitialized)
    const hasRedirectedRef = React.useRef(false)
    const effectiveUser = initialUser ?? user
    const hasResolvedAuth = !!initialUser || !!user || isInitialized

    // 【学习注释：先同步服务端用户，再让后续组件读取统一状态仓库】
    // `useLayoutEffect` 会在浏览器绘制前执行，适合做这种首屏状态对齐，减少一帧错误界面闪烁。
    React.useLayoutEffect(() => {
        if (!initialUser) {
            return
        }

        const userChanged = !areAppUsersEqual(user, initialUser)
        if (userChanged) {
            setUser(initialUser)
        }
        if (!isInitialized || userChanged) {
            setInitialized(true)
        }
    }, [initialUser, isInitialized, setInitialized, setUser, user])

    // 【学习注释：只有在鉴权结果明确后才做前端跳转】
    // 如果过早跳转，会把“正在初始化”误判成“未登录”，导致体验抖动。
    React.useEffect(() => {
        if (!hasResolvedAuth || effectiveUser || hasRedirectedRef.current) {
            return
        }

        hasRedirectedRef.current = true
        router.replace("/login")
    }, [effectiveUser, hasResolvedAuth, router])

    if (!hasResolvedAuth) {
        return (
            <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                Checking session...
            </div>
        )
    }

    if (!effectiveUser) {
        return null
    }

    return <>{children}</>
}
