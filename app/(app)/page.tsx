import { Suspense } from "react"
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
import { DashboardDutyActions } from "@/components/dashboard/DashboardDutyActions"
import { DashboardSignInWidget } from "@/components/dashboard/DashboardSignInWidget"
import { StudioOverview } from "@/components/dashboard/StudioOverview"
import { StudioOverviewSkeleton } from "@/components/dashboard/StudioOverviewSkeleton"

import { getAggregatedDashboardData } from "@/lib/services/dashboard-service"

export const revalidate = 60

const PERIODS: ReadonlyArray<{ id: number; label: string; start: string; end: string }> = [
    { id: 1, label: "第一节", start: "08:00", end: "09:35" },
    { id: 2, label: "第二节", start: "10:05", end: "11:40" },
    { id: 3, label: "第三节", start: "13:30", end: "15:05" },
    { id: 4, label: "第四节", start: "15:35", end: "17:10" },
]

const DAYS = ["一", "二", "三", "四", "五"]

/**
 * 【学习注释：首页被剥离为纯粹的视图层】
 * 所有复杂的数据获取、并发控制、排班过滤、打卡状态聚类等操作，
 * 都已下沉到了 dashboard-service 中，页面文件仅承担数据解构与骨架排版。
 */
export default async function DashboardPage() {
    const { me, dutyInfo, globalData } = await getAggregatedDashboardData()

    const {
        myTodayAssignedPeriods,
        myHasSignedInToday,
        nextDuty,
        myTodayRosterStatuses,
    } = dutyInfo

    const {
        rosters,
        activeMembers,
        activeRosters,
    } = globalData

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

                                    {myTodayRosterStatuses.length > 0 && (
                                        <div className="rounded-md border p-2 space-y-1">
                                            <p className="text-xs text-muted-foreground">今日签到状态</p>
                                            {myTodayRosterStatuses.map((status) => (
                                                <div key={status.id} className="flex items-center justify-between text-xs">
                                                    <span>第{status.period}节</span>
                                                    {status.signedAtLabel ? (
                                                        <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                                            {status.signedAtLabel}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                                                            <Clock3 className="w-3 h-3 mr-1" />待签到
                                                        </Badge>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <DashboardDutyActions initialData={rosters} initialMembers={activeMembers} />

            <Suspense fallback={<StudioOverviewSkeleton />}>
                <StudioOverview activeRosters={activeRosters} />
            </Suspense>
        </div>
    )
}
