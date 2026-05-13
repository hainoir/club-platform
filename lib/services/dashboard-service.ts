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

import { PERIOD_START_MINUTES } from "@/lib/duty/duty-constants"

type DutyLeaveSlot = Pick<Database["public"]["Tables"]["duty_leaves"]["Row"], "id" | "member_id" | "day_of_week" | "period" | "status">
type DutyLogSummary = Pick<Database["public"]["Tables"]["duty_logs"]["Row"], "member_id" | "sign_in_time" | "sign_in_date" | "location_verified">
type StudioSessionWithMember = Pick<Database["public"]["Tables"]["studio_sessions"]["Row"], "member_id" | "started_at" | "ended_at" | "is_active"> & {
    member: Pick<Database["public"]["Tables"]["members"]["Row"], "name"> | null
}

type SupabaseListResult<T> = {
    data: T[] | null
    error: { message: string } | null
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

/**
 * 【学习注释：把周期性排班映射成可排序的真实时间】
 * duty_rosters 只记录星期和节次，服务端聚合层需要把它翻译成一个具体 Date，
 * 才能在首页里稳定算出“下一次值班”这种面向用户的结果。
 */
function resolveNextDutyTime(day: number, period: number, now: Date): Date {
    const slotDateKey = getNextDutySlotDateKey(day, period, now)
    const [year, month, date] = slotDateKey.split("-").map(Number)
    const candidate = new Date(year, month - 1, date)

    const startMinutes = PERIOD_START_MINUTES[period] || 8 * 60
    candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

    return candidate
}

/**
 * 【学习注释：服务端错误收口】
 * 仪表盘会并发读取多张表，这里先把 Supabase 的列表结果统一拆成“抛错 or 返回数组”，
 * 避免页面层再去判断每个 data/error 分支。
 */
function unwrapSupabaseList<T>(label: string, result: SupabaseListResult<T>): T[] {
    if (result.error) {
        throw new Error(`${label}: ${result.error.message}`)
    }

    return result.data || []
}

/**
 * 【学习注释：首页服务端聚合入口】
 * 页面本身保持轻量，真正的数据拼装放在服务层一次并发完成：
 * 排班、已批准请假、今日签到、活跃成员和当前登录用户都在这里收口。
 */
export async function getAggregatedDashboardData(): Promise<DashboardAggregatedData> {
    const supabase = await createClient()

    const now = new Date()
    const dutyNow = getDutyNow()
    const todayDow = dutyNow.dayOfWeek
    const todayDateKey = dutyNow.dateKey
    const isTodayDutyRequired = isDutyRequiredDate(todayDateKey)

    // 【学习注释：并发读取首页关键事实】
    // 这些查询彼此独立，放在 Promise.all 中能减少首页等待时间。
    const [
        rostersResult,
        approvedLeavesResult,
        todayLogsResult,
        membersResult,
        authResult,
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

    const rosters = unwrapSupabaseList("duty rosters", rostersResult)
    const approvedLeaves = unwrapSupabaseList("approved leaves", approvedLeavesResult)
    const activeRosters = filterRostersForDutyAvailability(rosters, approvedLeaves)
    const activeMembers = unwrapSupabaseList("active members", membersResult)
    const todayLogs = unwrapSupabaseList("today duty logs", todayLogsResult)

    // 【学习注释：签到事实先折叠成 slot map】
    // 后面无论是判断“我今天是否签到”还是生成每节课状态，都只基于这一份标准化结果。
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

    // 【学习注释：可值班名单以“排班 - 已批准请假”为准】
    // 待审批请假不会改变可值班性，这和数据库契约保持一致。
    const todayRosters = isTodayDutyRequired
        ? activeRosters
              .filter((r) => r.day_of_week === todayDow)
              .sort((a, b) => (a.period === b.period ? a.member.name.localeCompare(b.member.name, "zh-CN") : a.period - b.period))
        : []

    const me = await resolveAppUser(supabase, authResult.error ? null : authResult.data.user)

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

    // 【学习注释：自习统计和首页签到链路分离】
    // 仪表盘只消费排行榜结果，具体统计口径继续留在 service/lib 层维护。
    const studioSessionsResult = await supabase
        .from("studio_sessions")
        .select("member_id, started_at, ended_at, is_active, member:members(name)")
        .returns<StudioSessionWithMember[]>()

    const studioSessions = unwrapSupabaseList("studio sessions", studioSessionsResult)
    const studioStudyLeaderboard = buildStudioStudyLeaderboard(studioSessions, now)

    return {
        studioStudyLeaderboard,
    }
}
