import type { AppUser } from "@/lib/app-user"
import type { createClient } from "@/utils/supabase/client"

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
    supabase: ReturnType<typeof createClient>
    user: AppUser
    isAdmin: boolean
    now: Date
    dutyReminder: boolean
    eventReminder: boolean
    keyTransferReminder: boolean
}

export type NotificationSource = (context: NotificationSourceContext) => Promise<AppNotification[]>
