"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { areAppUsersEqual, type AppUser } from "@/lib/app-user"
import { useUserStore } from "@/store/useUserStore"

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
