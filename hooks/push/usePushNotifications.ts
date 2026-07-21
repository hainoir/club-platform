"use client"

import * as React from "react"

import { getDeviceLabel, getPushSupport, urlBase64ToUint8Array } from "@/lib/push/client"
import { usePushProvider } from "@/components/providers/PushProvider"
import { usePreferencesStore } from "@/store/usePreferencesStore"
import { useUserStore } from "@/store/useUserStore"
import type {
    PushCapabilityState,
    PushDeviceStatus,
    PushSupportResult,
    ServerNotificationPreferences,
    SubscribePushRequest,
} from "@/types/push"

const EMPTY_STATUS: PushDeviceStatus = {
    activeDeviceCount: 0,
    lastTestAt: null,
    preferences: {
        inAppEnabled: true,
        webPushEnabled: false,
        dutyReminder: true,
        keyTransferReminder: true,
        leaveReminder: true,
        swapReminder: true,
        eventReminder: true,
    },
}

function stateFromSupport(support: PushSupportResult): PushCapabilityState {
    if (!support.supported) return "unsupported"
    if (support.reason === "ios_home_screen_required") return "requires_install"
    if (support.permission === "denied") return "permission_denied"
    if (support.permission === "granted" && support.subscription) return "enabled"
    return "permission_default"
}

async function readJson<T>(response: Response): Promise<T> {
    const data = (await response.json().catch(() => ({}))) as T & { error?: string }
    if (!response.ok) {
        throw new Error(data.error || "请求失败，请稍后重试。")
    }
    return data
}

function getLocalServerPreferences(webPushEnabled: boolean): ServerNotificationPreferences {
    const notifications = usePreferencesStore.getState().notifications
    return {
        inAppEnabled: notifications.inAppEnabled,
        webPushEnabled,
        dutyReminder: notifications.dutyReminder,
        keyTransferReminder: notifications.keyTransferReminder,
        leaveReminder: notifications.leaveReminder,
        swapReminder: notifications.swapReminder,
        eventReminder: notifications.eventReminder,
    }
}

export function usePushNotifications() {
    const user = useUserStore((state) => state.user)
    const { registration, registrationError, installPromptAvailable, requestInstall } = usePushProvider()
    const [capabilityState, setCapabilityState] = React.useState<PushCapabilityState>("checking")
    const [support, setSupport] = React.useState<PushSupportResult | null>(null)
    const [deviceStatus, setDeviceStatus] = React.useState<PushDeviceStatus>(EMPTY_STATUS)
    const [hasServerPreferences, setHasServerPreferences] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [busyAction, setBusyAction] = React.useState<string | null>(null)

    const refresh = React.useCallback(async () => {
        if (!user) return
        setError(null)

        try {
            const nextSupport = await getPushSupport(registration)
            setSupport(nextSupport)
            setCapabilityState(stateFromSupport(nextSupport))

            const response = await fetch("/api/push/status", { cache: "no-store" })
            const status = await readJson<PushDeviceStatus & { hasPreferences?: boolean }>(response)
            setDeviceStatus(status)
            setHasServerPreferences(status.hasPreferences === true)
        } catch (nextError) {
            setCapabilityState("error")
            setError(nextError instanceof Error ? nextError.message : "无法读取手机通知状态")
        }
    }, [registration, user])

    React.useEffect(() => {
        if (!user) return
        void refresh()
    }, [refresh, user])

    React.useEffect(() => {
        if (!registrationError) return
        setCapabilityState("error")
        setError(registrationError)
    }, [registrationError])

    const enable = React.useCallback(async () => {
        if (!registration) {
            setError("Service Worker 尚未准备完成，请稍后重试。")
            return false
        }

        setBusyAction("enable")
        setCapabilityState("subscribing")
        setError(null)

        try {
            const initialSupport = await getPushSupport(registration)
            if (initialSupport.reason === "ios_home_screen_required") {
                setSupport(initialSupport)
                setCapabilityState("requires_install")
                return false
            }
            if (!initialSupport.supported) {
                setSupport(initialSupport)
                setCapabilityState("unsupported")
                return false
            }

            const permission = await Notification.requestPermission()
            if (permission !== "granted") {
                setCapabilityState(permission === "denied" ? "permission_denied" : "permission_default")
                return false
            }

            const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
            if (!publicKey) {
                throw new Error("尚未配置 Web Push 公钥。")
            }

            const existing = await registration.pushManager.getSubscription()
            const subscription =
                existing ||
                (await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey),
                }))

            const localPreferences = getLocalServerPreferences(true)
            const request: SubscribePushRequest = {
                subscription: subscription.toJSON(),
                device: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform || undefined,
                    label: getDeviceLabel(),
                },
                preferences: {
                    inAppEnabled: localPreferences.inAppEnabled,
                    dutyReminder: localPreferences.dutyReminder,
                    keyTransferReminder: localPreferences.keyTransferReminder,
                    leaveReminder: localPreferences.leaveReminder,
                    swapReminder: localPreferences.swapReminder,
                    eventReminder: localPreferences.eventReminder,
                },
            }

            await readJson(
                await fetch("/api/push/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(request),
                })
            )

            const testResponse = await fetch("/api/push/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            })
            if (!testResponse.ok && testResponse.status !== 429) {
                await readJson(testResponse)
            }

            await refresh()
            return true
        } catch (nextError) {
            setCapabilityState("error")
            setError(nextError instanceof Error ? nextError.message : "开启手机通知失败")
            return false
        } finally {
            setBusyAction(null)
        }
    }, [refresh, registration])

    const sendTest = React.useCallback(async () => {
        setBusyAction("test")
        setError(null)
        try {
            await readJson(
                await fetch("/api/push/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                })
            )
            await refresh()
            return true
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "发送测试通知失败")
            return false
        } finally {
            setBusyAction(null)
        }
    }, [refresh])

    const disableCurrent = React.useCallback(async () => {
        setBusyAction("disable-current")
        setError(null)
        try {
            const subscription = await registration?.pushManager.getSubscription()
            if (subscription) {
                await readJson(
                    await fetch("/api/push/subscribe", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ endpoint: subscription.endpoint }),
                    })
                )
                await subscription.unsubscribe()
            }
            await refresh()
            return true
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "停用当前设备失败")
            return false
        } finally {
            setBusyAction(null)
        }
    }, [refresh, registration])

    const disableAll = React.useCallback(async () => {
        setBusyAction("disable-all")
        setError(null)
        try {
            await readJson(await fetch("/api/push/subscriptions/all", { method: "DELETE" }))
            const subscription = await registration?.pushManager.getSubscription()
            await subscription?.unsubscribe()
            await refresh()
            return true
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : "停用全部设备失败")
            return false
        } finally {
            setBusyAction(null)
        }
    }, [refresh, registration])

    const savePreferences = React.useCallback(
        async (preferences: Omit<ServerNotificationPreferences, "webPushEnabled">) => {
            try {
                const response = await fetch("/api/push/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(preferences),
                })
                const data = await readJson<{ preferences: ServerNotificationPreferences }>(response)
                setDeviceStatus((current) => ({ ...current, preferences: data.preferences }))
                setHasServerPreferences(true)
                return true
            } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "保存通知偏好失败")
                return false
            }
        },
        []
    )

    const install = React.useCallback(async () => {
        setBusyAction("install")
        try {
            const accepted = await requestInstall()
            if (accepted) await refresh()
            return accepted
        } finally {
            setBusyAction(null)
        }
    }, [refresh, requestInstall])

    return {
        capabilityState,
        support,
        deviceStatus,
        hasServerPreferences,
        error,
        busyAction,
        installPromptAvailable,
        install,
        enable,
        sendTest,
        disableCurrent,
        disableAll,
        savePreferences,
        refresh,
    }
}

export type PushNotificationsController = ReturnType<typeof usePushNotifications>
