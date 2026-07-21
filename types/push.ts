export type PushCapabilityState =
    | "checking"
    | "unsupported"
    | "requires_install"
    | "permission_default"
    | "subscribing"
    | "enabled"
    | "permission_denied"
    | "error"

export type PushSupportReason =
    | "insecure_context"
    | "service_worker_missing"
    | "push_manager_missing"
    | "ios_home_screen_required"
    | "permission_denied"

export interface PushSupportResult {
    supported: boolean
    installed: boolean
    permission: NotificationPermission | "unsupported"
    subscription: PushSubscription | null
    reason?: PushSupportReason
}

export interface WebPushPayload {
    notificationId: string
    title: string
    body: string
    url: string
    tag: string
    level: "info" | "warning" | "critical"
}

export interface ServerNotificationPreferences {
    inAppEnabled: boolean
    webPushEnabled: boolean
    dutyReminder: boolean
    keyTransferReminder: boolean
    leaveReminder: boolean
    swapReminder: boolean
    eventReminder: boolean
}

export interface PushDeviceStatus {
    activeDeviceCount: number
    lastTestAt: string | null
    preferences: ServerNotificationPreferences
}

export interface SubscribePushRequest {
    subscription: PushSubscriptionJSON
    device: {
        userAgent?: string
        platform?: string
        label?: string
    }
    preferences?: Omit<ServerNotificationPreferences, "webPushEnabled">
}

export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}
