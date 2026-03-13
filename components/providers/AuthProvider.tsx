"use client"
import * as React from "react"
import { normalizeUserRole, useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setInitialized } = useUserStore()
    const supabase = React.useMemo(() => createClient(), [])

    const initAuth = React.useCallback(async () => {
        try {
            const {
                data: { session },
            } = await supabase.auth.getSession()

            if (!session) {
                setUser(null)
                return
            }

            const { data: memberData } = await supabase
                .from('members')
                .select('id, role, name')
                .ilike('email', session.user.email || '')
                .single()

            if (memberData) {
                setUser({
                    id: memberData.id,
                    email: session.user.email || '',
                    role: normalizeUserRole(memberData.role),
                    name: memberData.name,
                })
            } else {
                setUser({
                    id: session.user.id,
                    email: session.user.email || '',
                    role: 'member',
                })
            }
        } catch (error) {
            console.error('Auth init error:', error)
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

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                await initAuth()
            }
        })

        return () => subscription.unsubscribe()
    }, [initAuth, setInitialized, setUser, supabase])

    return <>{children}</>
}
