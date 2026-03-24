"use client"
import * as React from "react"
import { isAdminRole, normalizeUserRole, useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"

type MemberLookupRow = {
    id: string
    role: string | null
    name: string | null
    created_at: string
}

const AUTH_INIT_TIMEOUT_MS = 8000

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

function rankRolePriority(role: string | null): number {
    return isAdminRole(role) ? 0 : 1
}

function pickPreferredMember(candidates: MemberLookupRow[], authUserId: string): MemberLookupRow | null {
    if (candidates.length === 0) return null

    const exactMatch = candidates.find((candidate) => candidate.id === authUserId)
    if (exactMatch) return exactMatch

    const sorted = [...candidates].sort((a, b) => {
        const roleDiff = rankRolePriority(a.role) - rankRolePriority(b.role)
        if (roleDiff !== 0) return roleDiff

        const timeA = Date.parse(a.created_at || "") || 0
        const timeB = Date.parse(b.created_at || "") || 0
        return timeB - timeA
    })
    return sorted[0] ?? null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setInitialized } = useUserStore()
    const supabase = React.useMemo(() => createClient(), [])
    // 【面试考点：异步任务缓存与防抖设计】
    // 这里通过引用缓存并复用同一个初始化鉴权异步任务实例。
    // 在严格模式或组件短时间多次更新时，保证不会重复发起大量网络请求造成竞态问题。
    const initAuthPromiseRef = React.useRef<Promise<void> | null>(null)

    const initAuth = React.useCallback(() => {
        if (initAuthPromiseRef.current) {
            return initAuthPromiseRef.current
        }

        const task = (async () => {
            try {
                await withTimeout(
                    (async () => {
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
                            let memberData: MemberLookupRow | null = null

                            const byIdResult = await supabase
                                .from('members')
                                .select('id, role, name, created_at')
                                .eq('id', activeSession.user.id)
                                .maybeSingle()

                            if (byIdResult.error) {
                                console.warn('[auth:init][lookup-error][id]', byIdResult.error.message)
                            } else if (byIdResult.data) {
                                memberData = byIdResult.data
                            } else {
                                console.warn('[auth:init][lookup-empty][id]', activeSession.user.id)
                            }

                            if (!memberData && activeSession.user.email) {
                                const byEmailResult = await supabase
                                    .from('members')
                                    .select('id, role, name, created_at')
                                    .ilike('email', activeSession.user.email)
                                    .order('created_at', { ascending: false })
                                    .limit(20)

                                if (byEmailResult.error) {
                                    console.warn('[auth:init][lookup-error][email]', byEmailResult.error.message)
                                } else {
                                    const candidates = byEmailResult.data || []
                                    memberData = pickPreferredMember(candidates, activeSession.user.id)
                                    if (!memberData) {
                                        console.warn('[auth:init][lookup-empty][email]', activeSession.user.email)
                                    }
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
                            console.warn('[auth:init][lookup-error][members]', lookupError)
                            setUser(fallbackUser)
                        }
                    })(),
                    AUTH_INIT_TIMEOUT_MS,
                    'auth init'
                )
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

        // 【面试考点：前后台切换与数据同步】
        // 注册窗口聚焦与页面可见性变化事件监听器。
        // 当用户从其他标签页或应用切回时立刻校验登录态，可避免敏感数据过期失效。
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
