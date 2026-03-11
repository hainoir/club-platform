import Link from "next/link"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import {
    ArrowRight,
    CalendarClock,
    CheckCircle2,
    Clock3,
    KeyRound,
    ListChecks,
    TriangleAlert,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AbsentMembersCard, StudioMembersCard } from "@/components/duty/AttendancePanels"
import { WeeklyProgressCard } from "@/components/dashboard/WeeklyProgressCard"
import { DashboardSignInWidget } from "@/components/dashboard/DashboardSignInWidget"
import { createClient } from "@/utils/supabase/server"
import type { RosterWithMember } from "@/hooks/useDuty"

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

const PERIOD_END_MINUTES: Record<number, number> = {
    1: 9 * 60 + 35,
    2: 11 * 60 + 40,
    3: 15 * 60 + 5,
    4: 17 * 60 + 10,
}

const ADMIN_ROLE_SET = new Set(["admin", "主席", "执行主席", "副主席", "部长"])

function getWeekMonday(base: Date): Date {
    const d = new Date(base)
    const dow = d.getDay()
    const diff = dow === 0 ? -6 : 1 - dow
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
}

function getDateKey(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
}

function getMatchedPeriod(minutes: number): number {
    if (minutes >= 7 * 60 + 30 && minutes <= 9 * 60 + 35) return 1
    if (minutes >= 9 * 60 + 35 && minutes <= 11 * 60 + 40) return 2
    if (minutes >= 13 * 60 && minutes <= 15 * 60 + 5) return 3
    if (minutes >= 15 * 60 + 5 && minutes <= 17 * 60 + 10) return 4
    return 0
}

function resolveNextDutyTime(day: number, period: number, now: Date): Date {
    const candidate = new Date(now)
    const currentDow = now.getDay()
    const delta = day - currentDow
    const nextOffset = delta >= 0 ? delta : delta + 7
    candidate.setDate(now.getDate() + nextOffset)

    const startMinutes = PERIOD_START_MINUTES[period] || 8 * 60
    candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

    if (candidate.getTime() < now.getTime()) {
        candidate.setDate(candidate.getDate() + 7)
    }

    return candidate
}

export default async function DashboardPage() {
    const supabase = await createClient()

    const now = new Date()
    const todayDow = now.getDay()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const todayDateKey = getDateKey(now)
    const monday = getWeekMonday(now)

    const [
        { data: rostersData },
        { data: weekLogsData },
        { data: upcomingEventData },
        { count: pendingSwapCount },
        { count: acceptedSwapCount },
        {
            data: { user: authUser },
        },
    ] = await Promise.all([
        supabase
            .from("duty_rosters")
            .select("id, member_id, day_of_week, period, has_key, created_at, member:members(id, name, student_id)")
            .order("day_of_week", { ascending: true })
            .order("period", { ascending: true }),
        supabase
            .from("duty_logs")
            .select("member_id, sign_in_time, location_verified")
            .gte("sign_in_time", monday.toISOString())
            .eq("location_verified", true),
        supabase
            .from("events")
            .select("id, title, event_date")
            .gt("event_date", now.toISOString())
            .order("event_date", { ascending: true })
            .limit(1),
        supabase.from("duty_swaps").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("duty_swaps").select("id", { count: "exact", head: true }).eq("status", "accepted"),
        supabase.auth.getUser(),
    ])

    const rosters = (rostersData || []) as unknown as RosterWithMember[]
    const weekLogs = (weekLogsData || []) as Array<{
        member_id: string
        sign_in_time: string
        location_verified: boolean | null
    }>

    const signedSlotMap = new Map<string, string>()
    weekLogs.forEach((log) => {
        if (!log.location_verified) return
        const signTime = new Date(log.sign_in_time)
        const minutes = signTime.getHours() * 60 + signTime.getMinutes()
        const period = getMatchedPeriod(minutes)
        const dow = signTime.getDay()
        if (period === 0 || dow < 1 || dow > 5) return

        const slotKey = `${log.member_id}-${getDateKey(signTime)}-${period}`
        if (!signedSlotMap.has(slotKey)) {
            signedSlotMap.set(slotKey, signTime.toISOString())
        }
    })

    const signedSlotSet = new Set(signedSlotMap.keys())

    const todayRosters = rosters
        .filter((r) => r.day_of_week === todayDow)
        .sort((a, b) => (a.period === b.period ? a.member.name.localeCompare(b.member.name, "zh-CN") : a.period - b.period))

    const todaySignedCount = todayRosters.filter((r) => signedSlotSet.has(`${r.member_id}-${todayDateKey}-${r.period}`)).length
    const todayPendingCount = Math.max(todayRosters.length - todaySignedCount, 0)

    let weekPastExpected = 0
    let weekPastSigned = 0

    rosters.forEach((r) => {
        if (r.day_of_week < 1 || r.day_of_week > 5) return

        const isPastDay = r.day_of_week < todayDow
        const isPastPeriodToday = r.day_of_week === todayDow && nowMinutes >= (PERIOD_END_MINUTES[r.period] || 24 * 60)
        if (!isPastDay && !isPastPeriodToday) return

        weekPastExpected += 1

        const slotDate = new Date(monday)
        slotDate.setDate(monday.getDate() + (r.day_of_week - 1))
        const slotKey = `${r.member_id}-${getDateKey(slotDate)}-${r.period}`
        if (signedSlotSet.has(slotKey)) {
            weekPastSigned += 1
        }
    })

    const weekRate = weekPastExpected > 0 ? Math.round((weekPastSigned / weekPastExpected) * 100) : 0

    const weekdayStats = DAYS.map((label, idx) => {
        const day = idx + 1
        const dayRosters = rosters.filter((r) => r.day_of_week === day)
        const slotDate = new Date(monday)
        slotDate.setDate(monday.getDate() + idx)
        const dateKey = getDateKey(slotDate)
        const signed = dayRosters.filter((r) => signedSlotSet.has(`${r.member_id}-${dateKey}-${r.period}`)).length
        const planned = dayRosters.length
        return {
            day,
            label,
            signed,
            planned,
            rate: planned > 0 ? Math.round((signed / planned) * 100) : 0,
        }
    })

    let me: { id: string; role: string; name: string } | null = null
    if (authUser?.email) {
        const { data: meRow } = await supabase
            .from("members")
            .select("id, role, name")
            .eq("email", authUser.email)
            .single()

        if (meRow) {
            me = meRow
        }
    }

    const isAdmin = !!me && ADMIN_ROLE_SET.has(me.role)

    let pendingKeyForMe = 0
    let myPendingSwapCount = 0

    if (me?.id) {
        const [{ count: keyCount }, { count: mySwapCount }] = await Promise.all([
            supabase
                .from("key_transfers")
                .select("id", { count: "exact", head: true })
                .eq("to_member_id", me.id)
                .eq("status", "pending"),
            supabase
                .from("duty_swaps")
                .select("id", { count: "exact", head: true })
                .eq("requester_id", me.id)
                .eq("status", "pending"),
        ])

        pendingKeyForMe = keyCount || 0
        myPendingSwapCount = mySwapCount || 0
    }

    const attentionCount = pendingKeyForMe + (isAdmin ? acceptedSwapCount || 0 : myPendingSwapCount)

    const myTodayRosters = me?.id ? todayRosters.filter((r) => r.member_id === me.id) : []
    const myTodayAssignedPeriods = Array.from(new Set(myTodayRosters.map((r) => r.period))).sort((a, b) => a - b)
    const myHasSignedInToday = !!me?.id && myTodayAssignedPeriods.some((period) => signedSlotSet.has(`${me.id}-${todayDateKey}-${period}`))

    let nextDuty:
        | {
            roster: RosterWithMember
            time: Date
        }
        | null = null

    if (me?.id) {
        const myRosters = rosters.filter((r) => r.member_id === me.id)
        if (myRosters.length > 0) {
            const sorted = myRosters
                .map((roster) => ({ roster, time: resolveNextDutyTime(roster.day_of_week, roster.period, now) }))
                .sort((a, b) => a.time.getTime() - b.time.getTime())
            nextDuty = sorted[0]
        }
    }

    const upcomingEvent = upcomingEventData?.[0]

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">值班执行仪表盘</h2>
                    <p className="text-sm text-muted-foreground mt-1">首页优先展示签到、待处理事项和今日排班，减少无效信息干扰。</p>
                </div>
                <div className="flex w-full sm:w-auto gap-2">
                    <Button asChild className="gap-2 w-full sm:w-auto">
                        <Link href="/duty">
                            打开值班大厅
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link href="/events">查看活动报名</Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3 items-start">
                <div className="lg:col-span-2">
                    <DashboardSignInWidget
                        memberId={me?.id || null}
                        todayAssignedPeriods={myTodayAssignedPeriods}
                        initialHasSignedInToday={myHasSignedInToday}
                    />
                </div>

                <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-primary" />
                            我的值班概览
                        </CardTitle>
                        <CardDescription>签到前后都可在这里快速确认当前安排。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
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
                                                            {format(new Date(signedAt), "HH:mm", { locale: zhCN })}
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

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>今日排班总数</CardDescription>
                        <CardTitle className="text-2xl">{todayRosters.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        {todayDow >= 1 && todayDow <= 5 ? `周${DAYS[todayDow - 1]}已安排 ${todayRosters.length} 个值班位` : "今日非工作日排班时段"}
                    </CardContent>
                </Card>

                <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>今日已签到</CardDescription>
                        <CardTitle className="text-2xl">{todaySignedCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">剩余 {todayPendingCount} 个值班位待签到</CardContent>
                </Card>

                <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>本周签到完成率</CardDescription>
                        <CardTitle className="text-2xl">{weekRate}%</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">{weekPastSigned}/{weekPastExpected} 个已结束班次完成签到</CardContent>
                </Card>

                <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>待处理提醒</CardDescription>
                        <CardTitle className="text-2xl">{attentionCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        {isAdmin ? `待审批代班 ${(acceptedSwapCount || 0)} 个` : `我发起的待处理代班 ${myPendingSwapCount} 个`}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2 bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ListChecks className="h-5 w-5 text-primary" />
                            今日值班名单
                        </CardTitle>
                        <CardDescription>按节次查看成员签到进度，便于现场快速点名。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {todayDow < 1 || todayDow > 5 ? (
                            <p className="text-sm text-muted-foreground">今日不在常规值班日（周一至周五）内。</p>
                        ) : todayRosters.length === 0 ? (
                            <p className="text-sm text-muted-foreground">今日暂无排班安排。</p>
                        ) : (
                            PERIODS.map((period) => {
                                const rows = todayRosters.filter((r) => r.period === period.id)
                                if (rows.length === 0) return null

                                return (
                                    <div key={period.id} className="rounded-lg border border-border/80 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-medium">{period.label}</p>
                                            <span className="text-xs text-muted-foreground">
                                                {period.start}-{period.end}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {rows.map((r) => {
                                                const slotKey = `${r.member_id}-${todayDateKey}-${r.period}`
                                                const signedAt = signedSlotMap.get(slotKey)
                                                return (
                                                    <div key={r.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
                                                        <span className="font-medium">{r.member.name}</span>
                                                        {signedAt ? (
                                                            <Badge variant="outline" className="h-5 border-emerald-300 text-emerald-700 bg-emerald-50">
                                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                                {format(new Date(signedAt), "HH:mm", { locale: zhCN })}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="h-5 border-amber-300 text-amber-700 bg-amber-50">
                                                                <Clock3 className="w-3 h-3 mr-1" />待签到
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <TriangleAlert className="h-4 w-4 text-amber-500" />
                                今日重点提醒
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex items-center justify-between rounded-md border p-2">
                                <span>待响应代班请求</span>
                                <Badge variant="outline">{pendingSwapCount || 0}</Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-2">
                                <span>待审批代班请求</span>
                                <Badge variant="outline">{acceptedSwapCount || 0}</Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-2">
                                <span>待确认钥匙交接</span>
                                <Badge variant="outline" className="inline-flex items-center gap-1">
                                    <KeyRound className="h-3 w-3" />
                                    {pendingKeyForMe}
                                </Badge>
                            </div>
                            {upcomingEvent ? (
                                <p className="text-xs text-muted-foreground pt-1">
                                    最近活动：{upcomingEvent.title}（{format(new Date(upcomingEvent.event_date), "M月d日 HH:mm", { locale: zhCN })}）
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground pt-1">最近暂无即将开始的活动。</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <WeeklyProgressCard stats={weekdayStats} />

            <div className="grid gap-4 lg:grid-cols-2">
                <AbsentMembersCard rosters={rosters} />
                <StudioMembersCard rosters={rosters} />
            </div>
        </div>
    )
}

