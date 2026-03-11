"use client"

import * as React from "react"
import { createClient } from "@/utils/supabase/client"
import { ADMIN_ROLES, useUserStore } from "@/store/useUserStore"
import { usePreferencesStore } from "@/store/usePreferencesStore"

const READ_IDS_STORAGE_KEY = "club-read-notification-ids-v1"

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五"]

const PERIOD_START_TIMES: Record<number, [number, number]> = {
    1: [8, 0],
    2: [10, 5],
    3: [13, 30],
    4: [15, 35],
}

const PERIOD_END_TIMES: Record<number, [number, number]> = {
    1: [9, 35],
    2: [11, 40],
    3: [15, 5],
    4: [17, 10],
}

export type NotificationLevel = "info" | "warning" | "critical"

export interface AppNotification {
    id: string
    title: string
    description: string
    href?: string
    createdAt: string
    level: NotificationLevel
}

function formatDutySlot(day: number, period: number): string {
    const dayLabel = day >= 1 && day <= 5 ? DAY_LABELS[day - 1] : `周${day}`
    return `${dayLabel} 第${period}节`
}

function parseStoredIds(raw: string | null): string[] {
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((id): id is string => typeof id === "string")
    } catch {
        return []
    }
}

function resolveNextSlotTime(day: number, period: number, now: Date): Date {
    const [hour, minute] = PERIOD_START_TIMES[period] || [8, 0]
    const candidate = new Date(now)
    const currentDow = now.getDay()
    const delta = day - currentDow

    candidate.setDate(now.getDate() + (delta >= 0 ? delta : delta + 7))
    candidate.setHours(hour, minute, 0, 0)

    if (candidate.getTime() < now.getTime()) {
        candidate.setDate(candidate.getDate() + 7)
    }

    return candidate
}

function getMatchedPeriod(minutes: number): number {
    if (minutes >= 7 * 60 + 30 && minutes <= 9 * 60 + 35) return 1
    if (minutes >= 9 * 60 + 35 && minutes <= 11 * 60 + 40) return 2
    if (minutes >= 13 * 60 && minutes <= 15 * 60 + 5) return 3
    if (minutes >= 15 * 60 + 5 && minutes <= 17 * 60 + 10) return 4
    return 0
}

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
            const isAdmin = ADMIN_ROLES.includes(user.role || "")
            const now = new Date()
            const nowMinutes = now.getHours() * 60 + now.getMinutes()
            const todayDow = now.getDay()
            const todayStart = new Date(now)
            todayStart.setHours(0, 0, 0, 0)

            const [
                incomingKeyTransfersResult,
                outgoingKeyTransfersResult,
                swapResult,
                myRostersResult,
                todaySignInsResult,
                enrolledEventsResult,
            ] = await Promise.all([
                keyTransferReminder
                    ? supabase
                          .from("key_transfers")
                          .select("id, note, created_at, from_member:members!key_transfers_from_member_id_fkey(name)")
                          .eq("to_member_id", user.id)
                          .eq("status", "pending")
                          .order("created_at", { ascending: false })
                          .limit(6)
                    : Promise.resolve({ data: [] as any[] }),
                keyTransferReminder
                    ? supabase
                          .from("key_transfers")
                          .select("id, created_at, to_member:members!key_transfers_to_member_id_fkey(name)")
                          .eq("from_member_id", user.id)
                          .eq("status", "pending")
                          .order("created_at", { ascending: false })
                          .limit(6)
                    : Promise.resolve({ data: [] as any[] }),
                dutyReminder
                    ? isAdmin
                        ? supabase
                              .from("duty_swaps")
                              .select("id, original_day, original_period, created_at, requester:members!duty_swaps_requester_id_fkey(name)")
                              .eq("status", "accepted")
                              .order("created_at", { ascending: false })
                              .limit(6)
                        : supabase
                              .from("duty_swaps")
                              .select("id, status, original_day, original_period, created_at, target:members!duty_swaps_target_id_fkey(name)")
                              .eq("requester_id", user.id)
                              .in("status", ["pending", "accepted"])
                              .order("created_at", { ascending: false })
                              .limit(6)
                    : Promise.resolve({ data: [] as any[] }),
                dutyReminder
                    ? supabase.from("duty_rosters").select("id, day_of_week, period").eq("member_id", user.id)
                    : Promise.resolve({ data: [] as any[] }),
                dutyReminder
                    ? supabase
                          .from("duty_logs")
                          .select("sign_in_time")
                          .eq("member_id", user.id)
                          .eq("location_verified", true)
                          .gte("sign_in_time", todayStart.toISOString())
                    : Promise.resolve({ data: [] as any[] }),
                eventReminder
                    ? supabase
                          .from("event_attendees")
                          .select("id, event:events!event_attendees_event_id_fkey(id, title, event_date)")
                          .eq("user_email", user.email)
                    : Promise.resolve({ data: [] as any[] }),
            ])

            const items: AppNotification[] = []

            ;(incomingKeyTransfersResult.data || []).forEach((t: any) => {
                items.push({
                    id: `key-transfer-in-${t.id}`,
                    title: "待确认钥匙交接",
                    description: `${t.from_member?.name || "成员"} 向你发起了钥匙交接${t.note ? `：${t.note}` : ""}`,
                    href: "/duty",
                    createdAt: t.created_at,
                    level: "critical",
                })
            })

            ;(outgoingKeyTransfersResult.data || []).forEach((t: any) => {
                items.push({
                    id: `key-transfer-out-${t.id}`,
                    title: "钥匙交接待对方确认",
                    description: `已移交给 ${t.to_member?.name || "成员"}，等待对方确认。`,
                    href: "/duty",
                    createdAt: t.created_at,
                    level: "info",
                })
            })

            if (isAdmin) {
                ;(swapResult.data || []).forEach((s: any) => {
                    items.push({
                        id: `swap-review-${s.id}`,
                        title: "代班请求待审批",
                        description: `${s.requester?.name || "成员"} 的 ${formatDutySlot(s.original_day, s.original_period)} 代班请求待你审批。`,
                        href: "/duty",
                        createdAt: s.created_at,
                        level: "warning",
                    })
                })
            } else {
                ;(swapResult.data || []).forEach((s: any) => {
                    const waitingApproval = s.status === "accepted"
                    items.push({
                        id: `swap-followup-${s.id}`,
                        title: waitingApproval ? "代班已应答，待管理员审批" : "代班请求待志愿者响应",
                        description: `${formatDutySlot(s.original_day, s.original_period)} ${
                            waitingApproval ? `已由 ${s.target?.name || "成员"} 应答` : "暂时还没有人接单"
                        }`,
                        href: "/duty",
                        createdAt: s.created_at,
                        level: waitingApproval ? "warning" : "info",
                    })
                })
            }

            const myRosters = (myRostersResult.data || []) as Array<{ id: string; day_of_week: number; period: number }>
            const todaySignIns = (todaySignInsResult.data || []) as Array<{ sign_in_time: string }>

            if (myRosters.length > 0) {
                const upcoming = myRosters
                    .map((r) => ({ ...r, nextTime: resolveNextSlotTime(r.day_of_week, r.period, now) }))
                    .sort((a, b) => a.nextTime.getTime() - b.nextTime.getTime())[0]

                const diffMs = upcoming.nextTime.getTime() - now.getTime()
                const diffHours = diffMs / 1000 / 60 / 60

                if (diffHours <= 24 && diffHours > 0) {
                    items.push({
                        id: `duty-upcoming-${upcoming.id}-${upcoming.nextTime.toISOString().slice(0, 10)}`,
                        title: "值班即将开始",
                        description: `${formatDutySlot(upcoming.day_of_week, upcoming.period)} 约在 ${Math.max(1, Math.round(diffHours * 60))} 分钟后开始。`,
                        href: "/duty",
                        createdAt: upcoming.nextTime.toISOString(),
                        level: "info",
                    })
                }

                if (todayDow >= 1 && todayDow <= 5) {
                    const signedPeriodsToday = new Set(
                        todaySignIns
                            .map((log) => {
                                const signTime = new Date(log.sign_in_time)
                                const minutes = signTime.getHours() * 60 + signTime.getMinutes()
                                return getMatchedPeriod(minutes)
                            })
                            .filter((period) => period > 0)
                    )

                    myRosters
                        .filter((r) => r.day_of_week === todayDow)
                        .forEach((r) => {
                            const [endHour, endMinute] = PERIOD_END_TIMES[r.period] || [23, 59]
                            const overDueAtMinutes = endHour * 60 + endMinute + 10
                            if (nowMinutes <= overDueAtMinutes) return
                            if (signedPeriodsToday.has(r.period)) return

                            items.push({
                                id: `duty-overdue-${r.id}-${todayStart.toISOString().slice(0, 10)}`,
                                title: "值班签到已逾期",
                                description: `${formatDutySlot(r.day_of_week, r.period)} 已结束超过 10 分钟，仍未签到。`,
                                href: "/duty",
                                createdAt: now.toISOString(),
                                level: "critical",
                            })
                        })
                }
            }

            ;(enrolledEventsResult.data || []).forEach((row: any) => {
                const event = Array.isArray(row.event) ? row.event[0] : row.event
                if (!event?.event_date) return

                const eventTime = new Date(event.event_date)
                const diffMs = eventTime.getTime() - now.getTime()
                const diffHours = diffMs / 1000 / 60 / 60

                if (diffHours <= 0 || diffHours > 72) return

                items.push({
                    id: `event-enrolled-${event.id}`,
                    title: "已报名活动即将开始",
                    description: `${event.title} 约在 ${Math.max(1, Math.round(diffHours))} 小时后开始。`,
                    href: "/events",
                    createdAt: event.event_date,
                    level: diffHours <= 12 ? "warning" : "info",
                })
            })

            const levelPriority: Record<NotificationLevel, number> = {
                critical: 0,
                warning: 1,
                info: 2,
            }

            items.sort((a, b) => {
                const levelDiff = levelPriority[a.level] - levelPriority[b.level]
                if (levelDiff !== 0) return levelDiff
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            })

            setNotifications(items.slice(0, 20))
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
