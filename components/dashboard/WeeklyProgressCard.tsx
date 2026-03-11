"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePreferencesStore } from "@/store/usePreferencesStore"

interface WeeklyStat {
    day: number
    label: string
    signed: number
    planned: number
    rate: number
}

export function WeeklyProgressCard({ stats }: { stats: WeeklyStat[] }) {
    const show = usePreferencesStore((s) => s.interface.showWeeklyProgressOnDashboard)

    if (!show) return null

    return (
        <Card className="bg-card/60 backdrop-blur-sm shadow-sm">
            <CardHeader>
                <CardTitle className="text-lg">本周签到进度</CardTitle>
                <CardDescription>按工作日展示每一天的值班签到完成率。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {stats.map((item) => (
                    <div key={item.day} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span>周{item.label}</span>
                            <span className="text-muted-foreground">
                                {item.signed}/{item.planned} ({item.rate}%)
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                            <div
                                className="h-2 rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(item.rate, 100)}%` }}
                            />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
