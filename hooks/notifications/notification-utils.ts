import { getDutyPeriodByMinutes, getNextDutySlotDateKey } from "@/lib/duty/duty-time"
import { PERIOD_START_MINUTES } from "@/lib/duty/duty-constants"

import type { AppNotification, NotificationLevel } from "./types"

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五"]

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
    const startMinutes = PERIOD_START_MINUTES[period] || 8 * 60
    const slotDateKey = getNextDutySlotDateKey(day, period, now)
    const [year, month, date] = slotDateKey.split("-").map(Number)
    const candidate = new Date(year, month - 1, date)
    candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

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
