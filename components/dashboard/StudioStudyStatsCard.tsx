import { BookOpen, Crown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { StudioStudyLeaderboardEntry } from "@/lib/studio-time"
import { formatDurationMinutes } from "@/lib/studio-time"

interface StudioStudyStatsCardProps {
    todayRanking: StudioStudyLeaderboardEntry[]
    weekRanking: StudioStudyLeaderboardEntry[]
    monthRanking: StudioStudyLeaderboardEntry[]
    semesterRanking: StudioStudyLeaderboardEntry[]
    totalRanking: StudioStudyLeaderboardEntry[]
    activeCount: number
}

function LeaderboardList({
    entries,
    metric,
}: {
    entries: StudioStudyLeaderboardEntry[]
    metric: keyof Pick<
        StudioStudyLeaderboardEntry,
        "todayMinutes" | "weekMinutes" | "monthMinutes" | "semesterMinutes" | "totalMinutes"
    >
}) {
    if (entries.length === 0) {
        return <p className="text-sm text-muted-foreground">当前口径下还没有可展示的自习记录。</p>
    }

    return (
        <div className="space-y-2">
            {entries.slice(0, 10).map((entry, index) => (
                <div
                    key={entry.memberId}
                    className="flex items-center justify-between rounded-lg border border-border/80 bg-background/70 px-3 py-2"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                            {index + 1}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">{entry.name}</p>
                                {index === 0 ? <Crown className="h-3.5 w-3.5 text-amber-500" /> : null}
                                {entry.isActive ? (
                                    <Badge variant="outline" className="h-5 border-emerald-300 bg-emerald-50 text-emerald-700">
                                        正在自习
                                    </Badge>
                                ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">历史累计 {formatDurationMinutes(entry.totalMinutes)}</p>
                        </div>
                    </div>

                    <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{formatDurationMinutes(entry[metric])}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

export function StudioStudyStatsCard({
    todayRanking,
    weekRanking,
    monthRanking,
    semesterRanking,
    totalRanking,
    activeCount,
}: StudioStudyStatsCardProps) {
    return (
        <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="h-5 w-5 text-primary" />
                    工作室自习时长排行榜
                </CardTitle>
                <CardDescription>按不同统计周期查看成员自习时长排名，进行中的会话会实时累计。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Tabs defaultValue="today" className="space-y-3">
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 text-xs">
                        <TabsTrigger value="today">今日</TabsTrigger>
                        <TabsTrigger value="week">本周</TabsTrigger>
                        <TabsTrigger value="month">本月</TabsTrigger>
                        <TabsTrigger value="semester">本学期</TabsTrigger>
                        <TabsTrigger value="total">历史</TabsTrigger>
                    </TabsList>

                    <TabsContent value="today">
                        <LeaderboardList entries={todayRanking} metric="todayMinutes" />
                    </TabsContent>
                    <TabsContent value="week">
                        <LeaderboardList entries={weekRanking} metric="weekMinutes" />
                    </TabsContent>
                    <TabsContent value="month">
                        <LeaderboardList entries={monthRanking} metric="monthMinutes" />
                    </TabsContent>
                    <TabsContent value="semester">
                        <LeaderboardList entries={semesterRanking} metric="semesterMinutes" />
                    </TabsContent>
                    <TabsContent value="total">
                        <LeaderboardList entries={totalRanking} metric="totalMinutes" />
                    </TabsContent>
                </Tabs>

                <p className="text-xs text-muted-foreground">当前 {activeCount} 人正在自习</p>
            </CardContent>
        </Card>
    )
}
