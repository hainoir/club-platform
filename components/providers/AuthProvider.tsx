"use client"
import * as React from "react"
import { normalizeUserRole, useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"
import { rehydrateSessionFromServer } from "@/utils/supabase/rehydrate"

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setInitialized } = useUserStore()
    const supabase = React.useMemo(() => createClient(), [])

    const initAuth = React.useCallback(async () => {
        try {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession()

            let activeSession = session
            if (!activeSession && !sessionError) {
                await new Promise((resolve) => setTimeout(resolve, 120))
                const {
                    data: { session: retrySession },
                } = await supabase.auth.getSession()
                activeSession = retrySession
            }

            if (!activeSession && !sessionError) {
                const bridged = await rehydrateSessionFromServer(supabase)
                if (bridged) {
                    const {
                        data: { session: bridgedSession },
                    } = await supabase.auth.getSession()
                    activeSession = bridgedSession
                }
            }

            if (sessionError || !activeSession) {
                setUser(null)
                return
            }

            const { data: memberData } = await supabase
                .from('members')
                .select('id, role, name')
                .ilike('email', activeSession.user.email || '')
                .single()

            if (memberData) {
                setUser({
                    id: memberData.id,
                    email: activeSession.user.email || '',
                    role: normalizeUserRole(memberData.role),
                    name: memberData.name,
                })
            } else {
                setUser({
                    id: activeSession.user.id,
                    email: activeSession.user.email || '',
                    role: 'member',
                })
            }
        } catch (error) {
            console.error('Auth init error:', error)
            setUser(null)
        } finally {
            setInitialized(true)
        }
    }, [setInitialized, setUser, supabase])

    React.useEffect(() => {
        initAuth()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_OUT') {
                setUser(null)
                setInitialized(true)
                return
            }

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
                await initAuth()
            }
        })

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
