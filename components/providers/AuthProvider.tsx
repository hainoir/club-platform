"use client"
import * as React from "react"
import { normalizeUserRole, useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setUser, setInitialized, isInitialized } = useUserStore()
    const supabase = createClient()

    React.useEffect(() => {
        const initAuth = async () => {
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession()

                if (!session) {
                    setUser(null)
                    setInitialized(true)
                    return
                }

                const { data: memberData } = await supabase
                    .from('members')
                    .select('id, role, name')
                    .eq('email', session.user.email || '')
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
        }

        if (!isInitialized) {
            initAuth()
        }

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'SIGNED_OUT') {
                setUser(null)
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                initAuth()
            }
        })

        return () => subscription.unsubscribe()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInitialized])

    return <>{children}</>
}
