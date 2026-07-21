import "server-only"

import webPush from "web-push"

import type { WebPushPayload } from "@/types/push"
import { classifyPushStatus } from "@/lib/push/policy"

let vapidConfigured = false

export interface PushSendFailure {
    statusCode: number | null
    transient: boolean
    subscriptionExpired: boolean
    message: string
}

function configureVapid() {
    if (vapidConfigured) return
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
    if (!subject || !publicKey || !privateKey) {
        throw new Error("Missing Web Push VAPID environment variables")
    }
    webPush.setVapidDetails(subject, publicKey, privateKey)
    vapidConfigured = true
}

export async function sendWebPush(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: WebPushPayload,
    options: { ttlSeconds: number; urgency: "normal" | "high" }
) {
    configureVapid()
    return webPush.sendNotification(
        {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        {
            TTL: Math.max(0, Math.floor(options.ttlSeconds)),
            urgency: options.urgency,
        }
    )
}

export function classifyPushFailure(error: unknown): PushSendFailure {
    const typed = error as { statusCode?: number; message?: string; body?: string }
    const statusCode = typeof typed?.statusCode === "number" ? typed.statusCode : null
    const { subscriptionExpired, transient } = classifyPushStatus(statusCode)
    const message = String(typed?.message || typed?.body || "Web Push request failed")
        .replace(/https?:\/\/\S+/g, "[push-endpoint]")
        .slice(0, 500)

    return { statusCode, transient, subscriptionExpired, message }
}
