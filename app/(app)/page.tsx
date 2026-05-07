import Link from "next/link"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import {
    CalendarClock,
    CheckCircle2,
    Clock3,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StudioMembersCard } from "@/components/duty/attendance/AttendancePanels"
import { DashboardDutyActions } from "@/components/dashboard/DashboardDutyActions"
import { DashboardSignInWidget } from "@/components/dashboard/DashboardSignInWidget"
import { StudioStudyStatsCard } from "@/components/dashboard/StudioStudyStatsCard"
import {
    getDutyNow,
    getNextDutySlotDateKey,
    resolveDutySignInSlot,
} from "@/lib/duty/duty-time"
import { filterRostersForDutyAvailability } from "@/lib/duty/duty-leaves"
import { isDutyRequiredDate } from "@/lib/duty/china-public-holidays"
import { buildStudioStudyLeaderboard } from "@/lib/studio/studio-time"
import { createClient } from "@/utils/supabase/server"
import { resolveAppUser } from "@/utils/supabase/resolve-app-user"
import type { SimpleMember } from "@/components/duty/roster/DutyTable"
import type { RosterWithMember } from "@/hooks/useDuty"
import type { Database } from "@/types/supabase"

export const revalidate = 60

const PERIODS: ReadonlyArray<{ id: number; label: string; start: string; end: string }> = [
    { id: 1, label: "第一节", start: "08:00", end: "09:35" },
    { id: 2, label: "第二节", start: "10:05", end: "11:40" },
    { id: 3, label: "第三节", start: "13:30", end: "15:05" },
    { id: 4, label: "第四节", start: "15:35", end: "17:10" },
]

const DAYS = ["一", "二", "三", "四", "五"]

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

// 【学习注释：把“周几第几节”换算成下一次真实时间点】
// 首页要展示的是用户能理解的日期时间，而不是数据库里的排班维度，所以这里先做一次领域转换。
function resolveNextDutyTime(day: number, period: number, now: Date): Date {
    const slotDateKey = getNextDutySlotDateKey(day, period, now)
    const [year, month, date] = slotDateKey.split("-").map(Number)
    const candidate = new Date(year, month - 1, date)

    const startMinutes = PERIOD_START_MINUTES[period] || 8 * 60
    candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

    return candidate
}

/**
 * 【学习注释：首页是一个服务端聚合层】
 * 这个页面不直接承载复杂交互，而是负责把排班、签到、活动和自习统计等数据一次性聚合好，
 * 再交给下游客户端组件消费。面试里可以把它描述成“面向首屏展示的 BFF 式数据整形”。
 */
export default async function DashboardPage() {
    const supabase = await createClient()

    const now = new Date()
    const dutyNow = getDutyNow()
    const todayDow = dutyNow.dayOfWeek
    const todayDateKey = dutyNow.dateKey
    const isTodayDutyRequired = isDutyRequiredDate(todayDateKey)

    // 【学习注释：首屏并发取数】
    // 这些卡片彼此独立，适合在服务端并发拉取；这样既减少总等待时间，也避免客户端再发一轮瀑布请求。
    const [
        { data: rostersData },
        { data: approvedLeavesData },
        { data: todayLogsData },
        { data: membersData },
        { data: studioSessionsData },
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
        supabase
            .from("studio_sessions")
            .select("member_id, started_at, ended_at, is_active, member:members(name)")
            .returns<StudioSessionWithMember[]>(),
        supabase.auth.getUser(),
    ])

    const rosters = rostersData || []
    const approvedLeaves = approvedLeavesData || []
    const activeRosters = filterRostersForDutyAvailability(rosters, approvedLeaves)
    const activeMembers = membersData || []
    const todayLogs = todayLogsData || []
    const studioSessions = studioSessionsData || []

    // 【学习注释：签到记录先压成 slot 索引】
    // 首页只保留个人工作台语境，用当天签到记录判断“我的今日签到状态”。
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

    // 【学习注释：当前用户身份在首页继续下沉成业务成员】
    // 首页只需要成员身份来计算“我的排班”，权限分流继续复用统一的 AppUser 解析链路。
    const me = await resolveAppUser(supabase, authUser)

    const myTodayRosters = me?.id ? todayRosters.filter((r) => r.member_id === me.id) : []
    const myTodayAssignedPeriods = Array.from(new Set(myTodayRosters.map((r) => r.period))).sort((a, b) => a - b)
    const myHasSignedInToday = !!me?.id && myTodayAssignedPeriods.some((period) => signedSlotSet.has(`${me.id}-${todayDateKey}-${period}`))

    // 【学习注释：把“我的排班列表”压缩成一个最近事项】
    // 仪表盘不追求展示全部细节，而是优先给用户一个下一步动作最明确的提醒。
    let nextDuty:
        | {
            roster: RosterWithMember
            time: Date
        }
        | null = null

    if (me?.id) {
        const myRosters = activeRosters.filter((r) => r.member_id === me.id)
        if (myRosters.length > 0) {
            const sorted = myRosters
                .map((roster) => ({ roster, time: resolveNextDutyTime(roster.day_of_week, roster.period, now) }))
                .sort((a, b) => a.time.getTime() - b.time.getTime())
            nextDuty = sorted[0]
        }
    }

    const studioStudyLeaderboard = buildStudioStudyLeaderboard(studioSessions, now)

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">我的工作台</h2>
                    <p className="text-sm text-muted-foreground mt-1">首页集中处理签到、请假、代班、钥匙交接和今日排班。</p>
                </div>
                <div className="flex w-full sm:w-auto gap-2">
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link href="/events">查看活动报名</Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="h-full lg:col-span-2">
                    <DashboardSignInWidget
                        memberId={me?.id || null}
                        todayAssignedPeriods={myTodayAssignedPeriods}
                        initialHasSignedInToday={myHasSignedInToday}
                    />
                </div>

                <div className="h-full space-y-4">
                    <Card className="flex h-full flex-col bg-card/60 backdrop-blur-sm shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <CalendarClock className="h-4 w-4 text-primary" />
                                我的值班概览
                            </CardTitle>
                            <CardDescription>签到前后都可在这里快速确认当前安排。</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col space-y-3 text-sm">
                            {!me ? (
                                <p className="text-muted-foreground">未找到成员身份，请重新登录或联系管理员。</p>
                            ) : (
                                <>
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">今日排班</p>
                                        <p className="mt-1 font-medium">
                                            {myTodayAssignedPeriods.length > 0
                                                ? myTodayAssignedPeriods.map((period) => `第${period}节`).join("、")
                                                : "今日无排班"}
                                        </p>
                                    </div>

                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">下一次值班</p>
                                        {!nextDuty ? (
                                            <p className="mt-1 text-muted-foreground">暂无后续排班</p>
                                        ) : (
                                            <>
                                                <p className="mt-1 font-medium">
                                                    周{DAYS[nextDuty.roster.day_of_week - 1]} {PERIODS.find((p) => p.id === nextDuty.roster.period)?.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {format(nextDuty.time, "M月d日 HH:mm", { locale: zhCN })} 开始
                                                </p>
                                            </>
                                        )}
                                    </div>

                                    {myTodayRosters.length > 0 && (
                                        <div className="rounded-md border p-2 space-y-1">
                                            <p className="text-xs text-muted-foreground">今日签到状态</p>
                                            {myTodayRosters.map((roster) => {
                                                const slotKey = `${roster.member_id}-${todayDateKey}-${roster.period}`
                                                const signedAt = signedSlotMap.get(slotKey)
                                                return (
                                                    <div key={roster.id} className="flex items-center justify-between text-xs">
                                                        <span>第{roster.period}节</span>
                                                        {signedAt ? (
                                                            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                                {signedAt}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                                                                <Clock3 className="w-3 h-3 mr-1" />待签到
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <DashboardDutyActions initialData={rosters} initialMembers={activeMembers} />

            <div className="grid gap-4 lg:grid-cols-3">
                <StudioMembersCard rosters={activeRosters} allowAdminDeleteStudy={false} />

                <div className="h-full lg:col-span-2">
                    <StudioStudyStatsCard
                        todayRanking={studioStudyLeaderboard.today}
                        weekRanking={studioStudyLeaderboard.week}
                        monthRanking={studioStudyLeaderboard.month}
                        semesterRanking={studioStudyLeaderboard.semester}
                        totalRanking={studioStudyLeaderboard.total}
                        activeCount={studioStudyLeaderboard.activeCount}
                    />
                </div>
            </div>
        </div>
    )
}

