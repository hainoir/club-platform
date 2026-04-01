"use client"

import * as React from "react"
import { areAppUsersEqual } from "@/lib/app-user"
import { useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"
import { resolveAppUser } from "@/utils/supabase/resolve-app-user"

const AUTH_INIT_TIMEOUT_MS = 30000

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const setUser = useUserStore((state) => state.setUser)
    const setInitialized = useUserStore((state) => state.setInitialized)
    const supabase = React.useMemo(() => createClient(), [])
    const initAuthPromiseRef = React.useRef<Promise<void> | null>(null)

    const initAuth = React.useCallback(() => {
        if (initAuthPromiseRef.current) {
            return initAuthPromiseRef.current
        }

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
