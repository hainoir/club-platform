"use client"

import * as React from "react"

import { isAdminRole, useUserStore } from "@/store/useUserStore"
import { usePreferencesStore } from "@/store/usePreferencesStore"
import { createClient } from "@/utils/supabase/client"

import { parseStoredIds, sortNotifications } from "./notification-utils"
import { getDutyScheduleNotifications } from "./sources/dutySchedule"
import { getEventReminderNotifications } from "./sources/eventReminders"
import { getKeyTransferNotifications } from "./sources/keyTransfers"
import { getLeaveApprovalNotifications } from "./sources/leaveApprovals"
import { getSwapRequestNotifications } from "./sources/swapRequests"
import type { AppNotification, NotificationSource } from "./types"
export type { AppNotification, NotificationLevel } from "./types"

const READ_IDS_STORAGE_KEY = "club-read-notification-ids-v1"

const NOTIFICATION_SOURCES: NotificationSource[] = [
    getKeyTransferNotifications,
    getSwapRequestNotifications,
    getLeaveApprovalNotifications,
    getDutyScheduleNotifications,
    getEventReminderNotifications,
]

export function useNotifications() {
    const supabase = React.useMemo(() => createClient(), [])
    const { user } = useUserStore()

    const { dutyReminder, eventReminder, keyTransferReminder, markReadOnOpen } = usePreferencesStore((s) => s.notifications)
    const autoRefreshSeconds = usePreferencesStore((s) => s.interface.autoRefreshSeconds)

    const [notifications, setNotifications] = React.useState<AppNotification[]>([])
    const [loading, setLoading] = React.useState(false)
    const [readIds, setReadIds] = React.useState<string[]>([])

    React.useEffect(() => {
        if (typeof window === "undefined") return
        setReadIds(parseStoredIds(window.localStorage.getItem(READ_IDS_STORAGE_KEY)))
    }, [])

    React.useEffect(() => {
        if (typeof window === "undefined") return
        window.localStorage.setItem(READ_IDS_STORAGE_KEY, JSON.stringify(readIds.slice(-300)))
    }, [readIds])

    const markAsRead = React.useCallback((id: string) => {
        setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    }, [])

    const markAllAsRead = React.useCallback(() => {
        setReadIds((prev) => {
            const merged = new Set(prev)
            notifications.forEach((n) => merged.add(n.id))
            return Array.from(merged).slice(-300)
        })
    }, [notifications])

    const refresh = React.useCallback(async () => {
        if (!user) {
            setNotifications([])
            return
        }

        setLoading(true)

        try {
            const context = {
                supabase,
                user,
                isAdmin: isAdminRole(user.role),
                now: new Date(),
                dutyReminder,
                eventReminder,
                keyTransferReminder,
            }
            const sourceBatches = await Promise.all(
                NOTIFICATION_SOURCES.map((source) => source(context))
            )

            setNotifications(sortNotifications(sourceBatches.flat()).slice(0, 20))
        } finally {
            setLoading(false)
        }
    }, [supabase, user, dutyReminder, eventReminder, keyTransferReminder])

    React.useEffect(() => {
        if (!user) return

        refresh()
        const intervalSeconds = Math.max(15, autoRefreshSeconds || 60)
        const timer = window.setInterval(refresh, intervalSeconds * 1000)
        return () => window.clearInterval(timer)
    }, [user, autoRefreshSeconds, refresh])

    const readSet = React.useMemo(() => new Set(readIds), [readIds])
    const unreadCount = React.useMemo(() => notifications.filter((n) => !readSet.has(n.id)).length, [notifications, readSet])
    const isRead = React.useCallback((id: string) => readSet.has(id), [readSet])

    return {
        notifications,
        loading,
        unreadCount,
        hasUnread: unreadCount > 0,
        markAsRead,
        markAllAsRead,
        isRead,
        refresh,
        markReadOnOpen,
    }
}
