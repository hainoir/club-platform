import { getDutyPeriodByMinutes, getNextDutySlotDateKey } from "@/lib/duty/duty-time"

import type { AppNotification, NotificationLevel } from "./types"

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五"]

export const PERIOD_END_TIMES: Record<number, [number, number]> = {
    1: [9, 35],
    2: [11, 40],
    3: [15, 5],
    4: [17, 10],
}

const PERIOD_START_TIMES: Record<number, [number, number]> = {
    1: [8, 0],
    2: [10, 5],
    3: [13, 30],
    4: [15, 35],
}

export function formatDutySlot(day: number, period: number): string {
    const dayLabel = day >= 1 && day <= 5 ? DAY_LABELS[day - 1] : `周${day}`
    return `${dayLabel} 第${period}节`
}

export function parseStoredIds(raw: string | null): string[] {
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((id): id is string => typeof id === "string")
    } catch {
        return []
    }
}

export function resolveNextSlotTime(day: number, period: number, now: Date): Date {
    const [hour, minute] = PERIOD_START_TIMES[period] || [8, 0]
    const slotDateKey = getNextDutySlotDateKey(day, period, now)
    const [year, month, date] = slotDateKey.split("-").map(Number)
    const candidate = new Date(year, month - 1, date)
    candidate.setHours(hour, minute, 0, 0)

    return candidate
}

export function getMatchedPeriod(minutes: number): number {
    return getDutyPeriodByMinutes(minutes)
}

export function sortNotifications(items: AppNotification[]) {
    const levelPriority: Record<NotificationLevel, number> = {
        critical: 0,
        warning: 1,
        info: 2,
    }

    return items.sort((a, b) => {
        const levelDiff = levelPriority[a.level] - levelPriority[b.level]
        if (levelDiff !== 0) return levelDiff
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
}
