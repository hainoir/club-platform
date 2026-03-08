"use client"
import * as React from "react"
import { useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setInitialized, isInitialized } = useUserStore()
    const supabase = createClient()

    React.useEffect(() => {
        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                // 如果本地拿不到 session（Token 失效或未登录），直接清空 user store
                if (!session) {
                    setUser(null)
                    setInitialized(true)
                    return
                }

                // 强制校验数据库中的最新权限，防止 zustand 缓存导致用户权限“漂移”或依然保留旧的过期高权限
                const { data: memberData } = await supabase
                    .from('members')
                    .select('id, role, name')
                    .eq('email', session.user.email || '')
                    .single()

                if (memberData) {
                    setUser({
                        id: memberData.id, // <== 这里修正：存入基于 members 业务表的外键互通 id
                        email: session.user.email || '',
                        role: memberData.role,
                        name: memberData.name
                    })
                } else {
                    setUser({
                        id: session.user.id,
                        email: session.user.email || '',
                        role: 'member', // 兜底权限
                    })
                }
            } catch (error) {
                console.error("Auth init error:", error)
            } finally {
                setInitialized(true) // 标记水合与校验完成
            }
        }

        if (!isInitialized) {
            initAuth()
        }

        // 监听 Supabase Auth 状态变化（例如其它标签页登出了，或者 Token 刷新）
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_OUT') {
                    setUser(null)
                } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    // 发生变化后重新验证同步最新身份信息
                    initAuth()
                }
            }
        )

        return () => subscription.unsubscribe()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInitialized])

    return <>{children}</>
}
