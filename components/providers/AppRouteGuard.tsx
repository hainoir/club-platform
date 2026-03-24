"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useUserStore } from "@/store/useUserStore"

export function AppRouteGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const user = useUserStore((state) => state.user)
    const isInitialized = useUserStore((state) => state.isInitialized)
    const hasRedirectedRef = React.useRef(false)

    React.useEffect(() => {
        if (!isInitialized || user || hasRedirectedRef.current) {
            return
        }

        hasRedirectedRef.current = true
        router.replace("/login")
    }, [isInitialized, router, user])

    if (!isInitialized) {
        return (
            <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                Checking session...
            </div>
        )
    }

    if (!user) {
        return null
    }

    return <>{children}</>
}
