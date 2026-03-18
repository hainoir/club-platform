"use client"
import * as React from "react"
import { normalizeUserRole, useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setInitialized } = useUserStore()
    const supabase = React.useMemo(() => createClient(), [])
    // 【面试考点：Promise 缓存与防抖设计】
    // 这里使用 useRef 缓存并复用相同的 initAuth Promise 实例。
    // 在 React StrictMode 或者组件短时间内多次触发更新的情况下，保证不会重复发起大量网络请求造成竞态问题（Race Condition）。
    const initAuthPromiseRef = React.useRef<Promise<void> | null>(null)

    const initAuth = React.useCallback(() => {
        if (initAuthPromiseRef.current) {
            return initAuthPromiseRef.current
        }

        const task = (async () => {
            try {
                const activeSession = await ensureClientSession(supabase)

                if (!activeSession) {
                    setUser(null)
                    return
                }
                const fallbackUser = {
                    id: activeSession.user.id,
                    email: activeSession.user.email || '',
                    role: 'member' as const,
                    name: typeof activeSession.user.user_metadata?.name === 'string'
                        ? activeSession.user.user_metadata.name
                        : undefined,
                }

                try {
                    let memberData: { id: string; role: string | null; name: string | null } | null = null

                    const byIdResult = await supabase
                        .from('members')
                        .select('id, role, name')
                        .eq('id', activeSession.user.id)
                        .maybeSingle()

                    if (byIdResult.error) {
                        console.warn('Auth init member lookup by id failed:', byIdResult.error.message)
                    } else if (byIdResult.data) {
                        memberData = byIdResult.data
                    }

                    if (!memberData && activeSession.user.email) {
                        const byEmailResult = await supabase
                            .from('members')
                            .select('id, role, name')
                            .ilike('email', activeSession.user.email)
                            .limit(1)
                            .maybeSingle()

                        if (byEmailResult.error) {
                            console.warn('Auth init member lookup by email failed:', byEmailResult.error.message)
                        } else if (byEmailResult.data) {
                            memberData = byEmailResult.data
                        }
                    }

                    if (memberData) {
                        setUser({
                            id: memberData.id,
                            email: activeSession.user.email || '',
                            role: normalizeUserRole(memberData.role),
                            name: memberData.name ?? undefined,
                        })
                    } else {
                        setUser(fallbackUser)
                    }
                } catch (lookupError) {
                    console.warn('Auth init member lookup error:', lookupError)
                    setUser(fallbackUser)
                }
            } catch (error) {
                console.error('Auth init error:', error)
                setUser(null)
            } finally {
                setInitialized(true)
                initAuthPromiseRef.current = null
            }
        })()

        initAuthPromiseRef.current = task
        return task
    }, [setInitialized, setUser, supabase])

    React.useEffect(() => {
        // 【面试考点：初始化鉴权与事件监听】
        // 在组件挂载时首次触发鉴权获取当前登录态
        initAuth()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_OUT') {
                setUser(null)
                setInitialized(true)
                return
            }

            if (event === 'INITIAL_SESSION') {
                return
            }

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                await initAuth()
            }
        })

        // 【面试考点：前后台切换与数据同步 (App Visibility & Focus)】
        // 注册对 "窗口聚焦" (focus) 和 "页面可见性改变" (visibilitychange) 的事件监听器。
        // 这是现代 Web 应用的最佳体验实践：当用户从别的标签页或应用切回来时，立刻校验登录态，确保敏感数据未过期失效。
        const handleFocus = () => {
            void initAuth()
        }
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void initAuth()
            }
        }

        window.addEventListener('focus', handleFocus)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            subscription.unsubscribe()
            window.removeEventListener('focus', handleFocus)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [initAuth, setInitialized, setUser, supabase])

    return <>{children}</>
}
