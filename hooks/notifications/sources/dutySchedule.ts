import { isDutyRequiredDate } from "@/lib/duty/china-public-holidays"
import { filterRostersForDutyAvailability } from "@/lib/duty/duty-leaves"
import { getDutyNow, toDutyDateTimeParts } from "@/lib/duty/duty-time"

import {
    formatDutySlot,
    getMatchedPeriod,
    PERIOD_END_TIMES,
    resolveNextSlotTime,
} from "../notification-utils"
import type { AppNotification, NotificationSourceContext } from "../types"

export async function getDutyScheduleNotifications({
    supabase,
    user,
    now,
    dutyReminder,
}: NotificationSourceContext): Promise<AppNotification[]> {
    if (!dutyReminder) return []

    const dutyNow = getDutyNow()
    const nowMinutes = dutyNow.minutes
    const todayDow = dutyNow.dayOfWeek
    const todayDateKey = dutyNow.dateKey
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const [myRostersResult, myApprovedLeavesResult, todaySignInsResult] = await Promise.all([
        supabase.from("duty_rosters").select("id, member_id, day_of_week, period").eq("member_id", user.id),
        supabase
            .from("duty_leaves")
            .select("id, member_id, day_of_week, period, status")
            .eq("member_id", user.id)
            .eq("status", "approved"),
        supabase
            .from("duty_logs")
            .select("sign_in_time")
            .eq("member_id", user.id)
            .eq("location_verified", true)
            .gte("sign_in_time", todayStart.toISOString()),
    ])

    const items: AppNotification[] = []
    const myRosters = filterRostersForDutyAvailability(
        (myRostersResult.data || []) as Array<{ id: string; member_id: string; day_of_week: number; period: number }>,
        (myApprovedLeavesResult.data || []) as Array<{ member_id: string; day_of_week: number; period: number; status?: string | null }>
    )
    const todaySignIns = (todaySignInsResult.data || []) as Array<{ sign_in_time: string }>

    if (myRosters.length === 0) return items

    const upcoming = myRosters
        .map((roster) => ({ ...roster, nextTime: resolveNextSlotTime(roster.day_of_week, roster.period, now) }))
        .sort((a, b) => a.nextTime.getTime() - b.nextTime.getTime())[0]

    const diffMs = upcoming.nextTime.getTime() - now.getTime()
    const diffHours = diffMs / 1000 / 60 / 60

    if (diffHours <= 24 && diffHours > 0) {
        items.push({
            id: `duty-upcoming-${upcoming.id}-${upcoming.nextTime.toISOString().slice(0, 10)}`,
            title: "值班即将开始",
            description: `${formatDutySlot(upcoming.day_of_week, upcoming.period)} 约在 ${Math.max(1, Math.round(diffHours * 60))} 分钟后开始。`,
            href: "/",
            createdAt: upcoming.nextTime.toISOString(),
            level: "info",
        })
    }

    if (!isDutyRequiredDate(todayDateKey)) return items

    const signedPeriodsToday = new Set(
        todaySignIns
            .map((log) => {
                const signTimeParts = toDutyDateTimeParts(log.sign_in_time)
                return getMatchedPeriod(signTimeParts.minutes)
            })
            .filter((period) => period > 0)
    )

    myRosters
        .filter((roster) => roster.day_of_week === todayDow)
        .forEach((roster) => {
            const [endHour, endMinute] = PERIOD_END_TIMES[roster.period] || [23, 59]
            const overDueAtMinutes = endHour * 60 + endMinute + 10
            if (nowMinutes <= overDueAtMinutes) return
            if (signedPeriodsToday.has(roster.period)) return

            items.push({
                id: `duty-overdue-${roster.id}-${todayDateKey}`,
                title: "值班签到已逾期",
                description: `${formatDutySlot(roster.day_of_week, roster.period)} 已结束超过 10 分钟，仍未签到。`,
                href: "/",
                createdAt: now.toISOString(),
                level: "critical",
            })
        })

    return items
}
