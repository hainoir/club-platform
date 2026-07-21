import type { AppUser } from "@/lib/app-user"
import type { SupabaseBrowserClient } from "@/hooks/shared/useSupabase"

export type NotificationLevel = "info" | "warning" | "critical"

export interface AppNotification {
    id: string
    title: string
    description: string
    href?: string
    createdAt: string
    level: NotificationLevel
}

export interface NotificationSourceContext {
    supabase: SupabaseBrowserClient
    user: AppUser
    isAdmin: boolean
    now: Date
    dutyReminder: boolean
    eventReminder: boolean
    keyTransferReminder: boolean
    leaveReminder: boolean
    swapReminder: boolean
}

export type NotificationSource = (context: NotificationSourceContext) => Promise<AppNotification[]>
