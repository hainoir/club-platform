"use client"

import * as React from "react"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { areAppUsersEqual } from "@/lib/app-user"
import { useUserStore } from "@/store/useUserStore"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"
import { resolveAppUser } from "@/utils/supabase/resolve-app-user"

const AUTH_INIT_TIMEOUT_MS = 30000

/**
 * 【学习注释：异步初始化超时保护】
 * 登录态恢复会串联本地会话、服务端桥接和资料查询，多一步都可能卡住首屏。
 * 这里加超时不是为了“修复网络”，而是为了保证前端不会无限等待在未知状态。
 */
async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
        return await Promise.race([
            task,
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${timeoutMs}ms`))
                }, timeoutMs)
            }),
        ])
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
    }
}

/**
 * 【学习注释：客户端接管登录态】
 * 根布局负责首屏骨架，真正持续监听登录态变化的是这个 provider。
 * 它会在页面获得焦点、标签页重新可见、token 刷新等时机重新对齐用户状态，
 * 让客户端状态仓库和 Supabase 会话长期保持同步。
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const setUser = useUserStore((state) => state.setUser)
    const setInitialized = useUserStore((state) => state.setInitialized)
    const supabase = useSupabase()
    const initAuthPromiseRef = React.useRef<Promise<void> | null>(null)

    const initAuth = React.useCallback(() => {
        if (initAuthPromiseRef.current) {
            return initAuthPromiseRef.current
        }

        // 【学习注释：串行化初始化】
        // 同一时间只保留一个初始化任务，避免焦点变化、可见性变化和鉴权事件同时触发时重复请求。
        const task = (async () => {
            const hadResolvedUser = (() => {
                const currentState = useUserStore.getState()
                return currentState.isInitialized && !!currentState.user
            })()

            try {
                await withTimeout(
                    (async () => {
                        const activeSession = await ensureClientSession(supabase)

                        if (!activeSession) {
                            setUser(null)
                            return
                        }

                        const resolvedUser = await resolveAppUser(supabase, activeSession.user)
                        if (!resolvedUser) {
                            setUser(null)
                            return
                        }

                        const currentUser = useUserStore.getState().user
                        if (!areAppUsersEqual(currentUser, resolvedUser)) {
                            setUser(resolvedUser)
                        }
                    })(),
                    AUTH_INIT_TIMEOUT_MS,
                    "auth init"
                )
            } catch (error) {
                console.error("Auth init error:", error)
                if (!hadResolvedUser) {
                    setUser(null)
                }
            } finally {
                setInitialized(true)
                initAuthPromiseRef.current = null
            }
        })()

        initAuthPromiseRef.current = task
        return task
    }, [setInitialized, setUser, supabase])

    React.useEffect(() => {
        void initAuth()

        // 【学习注释：事件驱动的登录态续同步】
        // Supabase 负责抛出认证事件，这里只做统一收口：把事件重新折叠成一次 `initAuth`。
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === "SIGNED_OUT") {
                setUser(null)
                setInitialized(true)
                return
            }

            if (event === "INITIAL_SESSION") {
                return
            }

            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
                await initAuth()
            }
        })

        const handleFocus = () => {
            void initAuth()
        }
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void initAuth()
            }
        }

        window.addEventListener("focus", handleFocus)
        document.addEventListener("visibilitychange", handleVisibilityChange)

        return () => {
            subscription.unsubscribe()
            window.removeEventListener("focus", handleFocus)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
        }
    }, [initAuth, setInitialized, setUser, supabase])

    return <>{children}</>
}
