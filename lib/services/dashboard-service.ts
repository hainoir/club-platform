import { createClient } from "@/utils/supabase/server"
import { resolveAppUser } from "@/utils/supabase/resolve-app-user"
import {
    getDutyNow,
    getNextDutySlotDateKey,
    resolveDutySignInSlot,
} from "@/lib/duty/duty-time"
import { filterRostersForDutyAvailability } from "@/lib/duty/duty-leaves"
import { isDutyRequiredDate } from "@/lib/duty/china-public-holidays"
import { buildStudioStudyLeaderboard } from "@/lib/studio/studio-time"
import type { SimpleMember } from "@/components/duty/roster/DutyTable"
import type { RosterWithMember } from "@/hooks/useDuty"
import type { Database } from "@/types/supabase"
import type { AppUser } from "@/lib/app-user"

const PERIOD_START_MINUTES: Record<number, number> = {
    1: 8 * 60,
    2: 10 * 60 + 5,
    3: 13 * 60 + 30,
    4: 15 * 60 + 35,
}

type DutyLeaveSlot = Pick<Database["public"]["Tables"]["duty_leaves"]["Row"], "id" | "member_id" | "day_of_week" | "period" | "status">
type DutyLogSummary = Pick<Database["public"]["Tables"]["duty_logs"]["Row"], "member_id" | "sign_in_time" | "sign_in_date" | "location_verified">
type StudioSessionWithMember = Pick<Database["public"]["Tables"]["studio_sessions"]["Row"], "member_id" | "started_at" | "ended_at" | "is_active"> & {
    member: Pick<Database["public"]["Tables"]["members"]["Row"], "name"> | null
}

export interface DashboardAggregatedData {
    me: AppUser | null
    dutyInfo: {
        todayDateKey: string
        isTodayDutyRequired: boolean
        myTodayAssignedPeriods: number[]
        myHasSignedInToday: boolean
        nextDuty: {
            roster: RosterWithMember
            time: Date
        } | null
        myTodayRosterStatuses: {
            id: string
            period: number
            signedAtLabel: string | null
        }[]
    }
    globalData: {
        rosters: RosterWithMember[]
        activeMembers: SimpleMember[]
        activeRosters: RosterWithMember[]
    }
}

export interface StudioDashboardData {
    studioStudyLeaderboard: ReturnType<typeof buildStudioStudyLeaderboard>
}

// 将排班转换为真实时间
function resolveNextDutyTime(day: number, period: number, now: Date): Date {
    const slotDateKey = getNextDutySlotDateKey(day, period, now)
    const [year, month, date] = slotDateKey.split("-").map(Number)
    const candidate = new Date(year, month - 1, date)

    const startMinutes = PERIOD_START_MINUTES[period] || 8 * 60
    candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

    return candidate
}

export async function getAggregatedDashboardData(): Promise<DashboardAggregatedData> {
    const supabase = await createClient()

    const now = new Date()
    const dutyNow = getDutyNow()
    const todayDow = dutyNow.dayOfWeek
    const todayDateKey = dutyNow.dateKey
    const isTodayDutyRequired = isDutyRequiredDate(todayDateKey)

    const [
        { data: rostersData },
        { data: approvedLeavesData },
        { data: todayLogsData },
        { data: membersData },
        {
            data: { user: authUser },
        },
    ] = await Promise.all([
        supabase
            .from("duty_rosters")
            .select("id, member_id, day_of_week, period, has_key, created_at, member:members(id, name, student_id)")
            .order("day_of_week", { ascending: true })
            .order("period", { ascending: true })
            .returns<RosterWithMember[]>(),
        supabase
            .from("duty_leaves")
            .select("id, member_id, day_of_week, period, status")
            .eq("status", "approved")
            .returns<DutyLeaveSlot[]>(),
        supabase
            .from("duty_logs")
            .select("member_id, sign_in_time, sign_in_date, location_verified")
            .eq("sign_in_date", todayDateKey)
            .eq("location_verified", true)
            .returns<DutyLogSummary[]>(),
        supabase
            .from("members")
            .select("id, name, student_id")
            .eq("status", "active")
            .order("name")
            .returns<SimpleMember[]>(),
        supabase.auth.getUser(),
    ])

    const rosters = rostersData || []
    const approvedLeaves = approvedLeavesData || []
    const activeRosters = filterRostersForDutyAvailability(rosters, approvedLeaves)
    const activeMembers = membersData || []
    const todayLogs = todayLogsData || []

    const signedSlotMap = new Map<string, string>()
    todayLogs.forEach((log) => {
        if (!log.location_verified) return
        const slot = resolveDutySignInSlot(log)
        if (!slot) return

        if (!signedSlotMap.has(slot.slotKey)) {
            signedSlotMap.set(slot.slotKey, slot.signedAtLabel)
        }
    })

    const signedSlotSet = new Set(signedSlotMap.keys())

    const todayRosters = isTodayDutyRequired
        ? activeRosters
              .filter((r) => r.day_of_week === todayDow)
              .sort((a, b) => (a.period === b.period ? a.member.name.localeCompare(b.member.name, "zh-CN") : a.period - b.period))
        : []

    const me = await resolveAppUser(supabase, authUser)

    const myTodayRosters = me?.id ? todayRosters.filter((r) => r.member_id === me.id) : []
    const myTodayAssignedPeriods = Array.from(new Set(myTodayRosters.map((r) => r.period))).sort((a, b) => a - b)
    const myHasSignedInToday = !!me?.id && myTodayAssignedPeriods.some((period) => signedSlotSet.has(`${me.id}-${todayDateKey}-${period}`))

    let nextDuty: { roster: RosterWithMember; time: Date } | null = null

    if (me?.id) {
        const myRosters = activeRosters.filter((r) => r.member_id === me.id)
        if (myRosters.length > 0) {
            const sorted = myRosters
                .map((roster) => ({ roster, time: resolveNextDutyTime(roster.day_of_week, roster.period, now) }))
                .sort((a, b) => a.time.getTime() - b.time.getTime())
            nextDuty = sorted[0]
        }
    }

    const myTodayRosterStatuses = myTodayRosters.map((roster) => {
        const slotKey = `${roster.member_id}-${todayDateKey}-${roster.period}`
        return {
            id: roster.id,
            period: roster.period,
            signedAtLabel: signedSlotMap.get(slotKey) || null,
        }
    })

    return {
        me,
        dutyInfo: {
            todayDateKey,
            isTodayDutyRequired,
            myTodayAssignedPeriods,
            myHasSignedInToday,
            nextDuty,
            myTodayRosterStatuses,
        },
        globalData: {
            rosters,
            activeMembers,
            activeRosters,
        },
    }
}

export async function getStudioDashboardData(): Promise<StudioDashboardData> {
    const supabase = await createClient()
    const now = new Date()

    const { data: studioSessionsData } = await supabase
        .from("studio_sessions")
        .select("member_id, started_at, ended_at, is_active, member:members(name)")
        .returns<StudioSessionWithMember[]>()

    const studioSessions = studioSessionsData || []
    const studioStudyLeaderboard = buildStudioStudyLeaderboard(studioSessions, now)

    return {
        studioStudyLeaderboard,
    }
}
