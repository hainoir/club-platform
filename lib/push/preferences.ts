import type { Database } from "@/types/supabase"
import type { ServerNotificationPreferences } from "@/types/push"

export type NotificationPreferenceRow = Database["public"]["Tables"]["notification_preferences"]["Row"]

export const DEFAULT_SERVER_NOTIFICATION_PREFERENCES: ServerNotificationPreferences = {
    inAppEnabled: true,
    webPushEnabled: false,
    dutyReminder: true,
    keyTransferReminder: true,
    leaveReminder: true,
    swapReminder: true,
    eventReminder: true,
}

export function toServerPreferences(row: NotificationPreferenceRow | null | undefined): ServerNotificationPreferences {
    if (!row) return DEFAULT_SERVER_NOTIFICATION_PREFERENCES
    return {
        inAppEnabled: row.in_app_enabled,
        webPushEnabled: row.web_push_enabled,
        dutyReminder: row.duty_reminder,
        keyTransferReminder: row.key_transfer_reminder,
        leaveReminder: row.leave_reminder,
        swapReminder: row.swap_reminder,
        eventReminder: row.event_reminder,
    }
}

export function categoryEnabled(preferences: NotificationPreferenceRow, notificationType: string): boolean {
    if (!preferences.web_push_enabled) return false
    if (notificationType.startsWith("duty_")) return preferences.duty_reminder
    if (notificationType.startsWith("key_transfer_")) return preferences.key_transfer_reminder
    if (notificationType.startsWith("leave_")) return preferences.leave_reminder
    if (notificationType.startsWith("swap_")) return preferences.swap_reminder
    if (notificationType === "push_test") return true
    return false
}
