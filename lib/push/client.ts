import type { PushSupportResult } from "@/types/push"

export const PUSH_SERVICE_WORKER_PATH = "/sw.js"

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
    const padding = "=".repeat((4 - (value.length % 4)) % 4)
    const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
    const decoded = globalThis.atob(normalized)
    const output = new Uint8Array(new ArrayBuffer(decoded.length))

    for (let index = 0; index < decoded.length; index += 1) {
        output[index] = decoded.charCodeAt(index)
    }

    return output
}

export function isIosLikeDevice(): boolean {
    if (typeof navigator === "undefined") return false
    const platform = navigator.platform || ""
    const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || touchMac
}

export function isStandaloneWebApp(): boolean {
    if (typeof window === "undefined") return false
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
    return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true
}

export async function getPushSupport(
    registration?: ServiceWorkerRegistration | null
): Promise<PushSupportResult> {
    if (typeof window === "undefined" || !window.isSecureContext) {
        return {
            supported: false,
            installed: false,
            permission: "unsupported",
            subscription: null,
            reason: "insecure_context",
        }
    }

    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        return {
            supported: false,
            installed: isStandaloneWebApp(),
            permission: "unsupported",
            subscription: null,
            reason: "service_worker_missing",
        }
    }

    if (!("PushManager" in window)) {
        return {
            supported: false,
            installed: isStandaloneWebApp(),
            permission: "unsupported",
            subscription: null,
            reason: "push_manager_missing",
        }
    }

    const installed = isStandaloneWebApp()
    if (isIosLikeDevice() && !installed) {
        return {
            supported: true,
            installed: false,
            permission: Notification.permission,
            subscription: null,
            reason: "ios_home_screen_required",
        }
    }

    const activeRegistration = registration || (await navigator.serviceWorker.ready)
    const subscription = await activeRegistration.pushManager.getSubscription()

    return {
        supported: true,
        installed,
        permission: Notification.permission,
        subscription,
        reason: Notification.permission === "denied" ? "permission_denied" : undefined,
    }
}

export function getDeviceLabel(): string {
    if (isIosLikeDevice()) return "iPhone / iPad Web App"
    if (/Android/i.test(navigator.userAgent)) return "Android Web App"
    return "浏览器设备"
}
