"use client"

import * as React from "react"

import { PUSH_SERVICE_WORKER_PATH, getDeviceLabel } from "@/lib/push/client"
import { usePreferencesStore } from "@/store/usePreferencesStore"
import { useUserStore } from "@/store/useUserStore"
import type { BeforeInstallPromptEvent, SubscribePushRequest } from "@/types/push"

interface PushContextValue {
    registration: ServiceWorkerRegistration | null
    registrationError: string | null
    installPromptAvailable: boolean
    requestInstall: () => Promise<boolean>
}

const PushContext = React.createContext<PushContextValue | null>(null)

function buildReconcileRequest(subscription: PushSubscription): SubscribePushRequest {
    return {
        subscription: subscription.toJSON(),
        device: {
            userAgent: navigator.userAgent,
            platform: navigator.platform || undefined,
            label: getDeviceLabel(),
        },
    }
}

async function syncServerPreferences() {
    const response = await fetch("/api/push/status", { cache: "no-store" })
    if (!response.ok) return
    const data = (await response.json()) as {
        hasPreferences?: boolean
        preferences?: {
            inAppEnabled: boolean
            dutyReminder: boolean
            keyTransferReminder: boolean
            leaveReminder: boolean
            swapReminder: boolean
            eventReminder: boolean
        }
    }
    if (!data.hasPreferences || !data.preferences) return

    const store = usePreferencesStore.getState()
    const entries = Object.entries(data.preferences) as Array<
        [keyof typeof data.preferences, boolean]
    >
    for (const [key, value] of entries) {
        const typedKey = key as "inAppEnabled" | "dutyReminder" | "keyTransferReminder" | "leaveReminder" | "swapReminder" | "eventReminder"
        if (store.notifications[typedKey] !== value) {
            store.setNotificationPreference(typedKey, value)
        }
    }
}

export function PushProvider({ children }: { children: React.ReactNode }) {
    const user = useUserStore((state) => state.user)
    const [registration, setRegistration] = React.useState<ServiceWorkerRegistration | null>(null)
    const [registrationError, setRegistrationError] = React.useState<string | null>(null)
    const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null)

    React.useEffect(() => {
        if (!("serviceWorker" in navigator) || !window.isSecureContext) return

        let cancelled = false
        navigator.serviceWorker
            .register(PUSH_SERVICE_WORKER_PATH, { scope: "/" })
            .then((nextRegistration) => {
                if (!cancelled) setRegistration(nextRegistration)
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setRegistrationError(error instanceof Error ? error.message : "Service Worker 注册失败")
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    React.useEffect(() => {
        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault()
            setInstallPrompt(event as BeforeInstallPromptEvent)
        }
        const handleInstalled = () => setInstallPrompt(null)

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
        window.addEventListener("appinstalled", handleInstalled)
        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
            window.removeEventListener("appinstalled", handleInstalled)
        }
    }, [])

    React.useEffect(() => {
        if (!user || !registration || Notification.permission !== "granted") return

        let cancelled = false
        registration.pushManager
            .getSubscription()
            .then(async (subscription) => {
                if (!subscription || cancelled) return
                await fetch("/api/push/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(buildReconcileRequest(subscription)),
                })
                await syncServerPreferences()
            })
            .catch(() => {
                // 设置页会展示可操作的详细错误；后台对齐失败不阻塞应用使用。
            })

        return () => {
            cancelled = true
        }
    }, [registration, user])

    React.useEffect(() => {
        if (!user) return
        void syncServerPreferences().catch(() => undefined)
    }, [user])

    const requestInstall = React.useCallback(async () => {
        if (!installPrompt) return false
        await installPrompt.prompt()
        const result = await installPrompt.userChoice
        if (result.outcome === "accepted") {
            setInstallPrompt(null)
            return true
        }
        return false
    }, [installPrompt])

    const value = React.useMemo<PushContextValue>(
        () => ({
            registration,
            registrationError,
            installPromptAvailable: !!installPrompt,
            requestInstall,
        }),
        [installPrompt, registration, registrationError, requestInstall]
    )

    return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePushProvider() {
    const value = React.useContext(PushContext)
    if (!value) throw new Error("usePushProvider must be used inside PushProvider")
    return value
}
