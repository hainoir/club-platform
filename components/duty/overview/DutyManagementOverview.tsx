import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { CheckCircle2, Clock3, KeyRound, ListChecks, TriangleAlert } from "lucide-react"

import { WeeklyProgressCard } from "@/components/dashboard/WeeklyProgressCard"
import { AbsentMembersCard } from "@/components/duty/attendance/AttendancePanels"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { RosterWithMember } from "@/hooks/useDuty"
import { filterRostersForDutyAvailability } from "@/lib/duty/duty-leaves"
import { isDutyRequiredDate } from "@/lib/duty/china-public-holidays"
import {
    addDaysToDateKey,
    getDutyNow,
    getDutyPeriodEndMinutes,
    getDutyWeekMondayDateKey,
    resolveDutySignInSlot,
} from "@/lib/duty/duty-time"

import { DUTY_PERIODS, DUTY_DAY_SHORT_LABELS } from "@/lib/duty/duty-constants"

const PERIODS = DUTY_PERIODS
const DAYS = DUTY_DAY_SHORT_LABELS

interface DutyLeaveSummary {
    id: string
    member_id: string
    day_of_week: number
    period: number
    status: string | null
}

interface DutyLogSummary {
    member_id: string
    sign_in_time: string
    sign_in_date: string | null
    location_verified: boolean | null
}

interface UpcomingEventSummary {
    title: string
    event_date: string
}

interface DutyManagementOverviewProps {
    rosters: RosterWithMember[]
    approvedLeaves: DutyLeaveSummary[]
    pendingLeaves: DutyLeaveSummary[]
    weekLogs: DutyLogSummary[]
    currentMemberId?: string | null
    pendingSwapCount?: number | null
    myRelatedSwapCount?: number
    pendingKeyForMe?: number
    upcomingEvent?: UpcomingEventSummary | null
}

export function DutyManagementOverview({
    rosters,
    approvedLeaves,
    pendingLeaves,
    weekLogs,
    currentMemberId = null,
    pendingSwapCount = 0,
    myRelatedSwapCount = 0,
    pendingKeyForMe = 0,
    upcomingEvent = null,
}: DutyManagementOverviewProps) {
    const now = new Date()
    const dutyNow = getDutyNow()
    const todayDow = dutyNow.dayOfWeek
    const nowMinutes = dutyNow.minutes
    const todayDateKey = dutyNow.dateKey
    const isTodayDutyRequired = isDutyRequiredDate(todayDateKey)
    const mondayDateKey = getDutyWeekMondayDateKey(now)
    const activeRosters = filterRostersForDutyAvailability(rosters, approvedLeaves)

    const signedSlotMap = new Map<string, string>()
    weekLogs.forEach((log) => {
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
    const todaySignedCount = todayRosters.filter((r) => signedSlotSet.has(`${r.member_id}-${todayDateKey}-${r.period}`)).length
    const todayPendingCount = Math.max(todayRosters.length - todaySignedCount, 0)

    let weekPastExpected = 0
    let weekPastSigned = 0

    activeRosters.forEach((r) => {
        if (r.day_of_week < 1 || r.day_of_week > 5) return

        const slotDateKey = addDaysToDateKey(mondayDateKey, r.day_of_week - 1)
        if (!isDutyRequiredDate(slotDateKey)) return

        const isPastDay = r.day_of_week < todayDow
        const isPastPeriodToday = r.day_of_week === todayDow && nowMinutes >= getDutyPeriodEndMinutes(r.period)
        if (!isPastDay && !isPastPeriodToday) return

        weekPastExpected += 1

        const slotKey = `${r.member_id}-${slotDateKey}-${r.period}`
        if (signedSlotSet.has(slotKey)) {
            weekPastSigned += 1
        }
    })

    const weekRate = weekPastExpected > 0 ? Math.round((weekPastSigned / weekPastExpected) * 100) : 0
    const weekdayStats = DAYS.map((label, idx) => {
        const day = idx + 1
        const dateKey = addDaysToDateKey(mondayDateKey, idx)
        const dayRosters = isDutyRequiredDate(dateKey) ? activeRosters.filter((r) => r.day_of_week === day) : []
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

    const myPendingLeaveCount = currentMemberId ? pendingLeaves.filter((leave) => leave.member_id === currentMemberId).length : 0
    const attentionCount = pendingKeyForMe + myPendingLeaveCount + myRelatedSwapCount

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="flex h-full flex-col bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>今日排班总数</CardDescription>
                        <CardTitle className="text-2xl">{todayRosters.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        {todayDow >= 1 && todayDow <= 5 ? `周${DAYS[todayDow - 1]}已安排 ${todayRosters.length} 个值班位` : "今日非工作日排班时段"}
                    </CardContent>
                </Card>

                <Card className="flex h-full flex-col bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>今日已签到</CardDescription>
                        <CardTitle className="text-2xl">{todaySignedCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">剩余 {todayPendingCount} 个值班位待签到</CardContent>
                </Card>

                <Card className="flex h-full flex-col bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>本周签到完成率</CardDescription>
                        <CardTitle className="text-2xl">{weekRate}%</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">{weekPastSigned}/{weekPastExpected} 个已结束班次完成签到</CardContent>
                </Card>

                <Card className="flex h-full flex-col bg-card/60 backdrop-blur-sm shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>待处理提醒</CardDescription>
                        <CardTitle className="text-2xl">{attentionCount}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                        我的待审批请假 {myPendingLeaveCount} 个，相关代班 {myRelatedSwapCount} 个
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="flex h-full flex-col bg-card/60 backdrop-blur-sm shadow-sm lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ListChecks className="h-5 w-5 text-primary" />
                            今日值班名单
                        </CardTitle>
                        <CardDescription>按节次查看成员签到进度，便于现场快速点名。</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col space-y-3">
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
                                        <div className="mb-2 flex items-center justify-between">
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
                                                            <Badge variant="outline" className="h-5 border-emerald-300 bg-emerald-50 text-emerald-700">
                                                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                                                {signedAt}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="h-5 border-amber-300 bg-amber-50 text-amber-700">
                                                                <Clock3 className="mr-1 h-3 w-3" />待签到
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

                <div className="h-full space-y-4">
                    <Card className="flex h-full flex-col bg-card/60 backdrop-blur-sm shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <TriangleAlert className="h-4 w-4 text-amber-500" />
                                今日重点提醒
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-1 flex-col space-y-2 text-sm">
                            <div className="flex items-center justify-between rounded-md border p-2">
                                <span>公共待响应代班</span>
                                <Badge variant="outline">{pendingSwapCount || 0}</Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-2">
                                <span>我相关的代班请求</span>
                                <Badge variant="outline">{myRelatedSwapCount}</Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-2">
                                <span>我的待审批请假</span>
                                <Badge variant="outline">{myPendingLeaveCount}</Badge>
                            </div>
                            <div className="flex items-center justify-between rounded-md border p-2">
                                <span>待确认钥匙交接</span>
                                <Badge variant="outline" className="inline-flex items-center gap-1">
                                    <KeyRound className="h-3 w-3" />
                                    {pendingKeyForMe}
                                </Badge>
                            </div>
                            {upcomingEvent ? (
                                <p className="pt-1 text-xs text-muted-foreground">
                                    最近活动：{upcomingEvent.title}（{format(new Date(upcomingEvent.event_date), "M月d日 HH:mm", { locale: zhCN })}）
                                </p>
                            ) : (
                                <p className="pt-1 text-xs text-muted-foreground">最近暂无即将开始的活动。</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <WeeklyProgressCard stats={weekdayStats} />

            <AbsentMembersCard rosters={activeRosters} />
        </div>
    )
}
