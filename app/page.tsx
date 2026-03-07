import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Activity, GraduationCap, CircleUserRound, CheckCircle2 } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { format, isAfter, subMonths, startOfMonth, endOfMonth } from "date-fns"
import { zhCN } from "date-fns/locale"
import DashboardCharts from "./DashboardCharts" // We will create this client component next

export default async function Dashboard() {
    const supabase = await createClient()

    // 1. 获取总成员数
    const { count: totalMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })

    // 2. 获取当前活跃成员数
    const { count: activeMembers } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

    // 3. 即将举行的活动
    const now = new Date().toISOString()
    const { data: upcomingEvents, count: upcomingCount } = await supabase
        .from('events')
        .select('title, event_date', { count: 'exact' })
        .gt('event_date', now)
        .order('event_date', { ascending: true })

    const nextEventTitle = upcomingEvents && upcomingEvents.length > 0
        ? upcomingEvents[0].title
        : "暂无预告"

    // 4. 总报名人次 (已签到)
    const { count: attendedCount } = await supabase
        .from('event_attendees')
        .select('*', { count: 'exact', head: true })
        .eq('is_attended', true)

    // ========================================
    // 数据流缝合 (Recent Activity)
    // ========================================
    const { data: newMembers } = await supabase
        .from('members')
        .select('name, join_date')
        .order('join_date', { ascending: false })
        .limit(3)

    const { data: recentEvents } = await supabase
        .from('events')
        .select('title, created_at')
        .order('created_at', { ascending: false })
        .limit(3)

    const activities: Array<{ id: string, action: string, dateStr: string, rawDate: Date, type: 'member' | 'event' }> = []

    newMembers?.forEach((m, idx) => {
        if (m.join_date) {
            activities.push({
                id: `m_${idx}`,
                action: `${m.name} 新加入了俱乐部`,
                dateStr: format(new Date(m.join_date), 'MM-dd HH:mm'),
                rawDate: new Date(m.join_date),
                type: 'member'
            })
        }
    })

    recentEvents?.forEach((e, idx) => {
        if (e.created_at) {
            activities.push({
                id: `e_${idx}`,
                action: `官方发布了新活动: "${e.title}"`,
                dateStr: format(new Date(e.created_at), 'MM-dd HH:mm'),
                rawDate: new Date(e.created_at),
                type: 'event'
            })
        }
    })

    // 排序混合
    activities.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())

    // ========================================
    // Chart Data Preparation (Last 6 Months)
    // ========================================
    const chartLabels: string[] = []
    const newMembersData: number[] = []
    const eventsData: number[] = []

    for (let i = 5; i >= 0; i--) {
        const targetDate = subMonths(new Date(), i)
        // format nicely as "10月"
        chartLabels.push(format(targetDate, 'MMM', { locale: zhCN }))

        const start = startOfMonth(targetDate).toISOString()
        const end = endOfMonth(targetDate).toISOString()

        const { count: mCount } = await supabase.from('members')
            .select('*', { count: 'exact', head: true })
            .gte('join_date', start)
            .lte('join_date', end)

        const { count: eCount } = await supabase.from('events')
            .select('*', { count: 'exact', head: true })
            .gte('event_date', start)
            .lte('event_date', end)

        newMembersData.push(mCount || 0)
        eventsData.push(eCount || 0)
    }

    const chartPayload = {
        labels: chartLabels,
        members: newMembersData,
        events: eventsData
    }

    const metrics = [
        { title: "总成员数", value: totalMembers || 0, description: "注册在案的全体人员", icon: Users },
        { title: "当前活跃", value: activeMembers || 0, description: "账号状态为活跃", icon: Activity },
        { title: "即将举行活动", value: upcomingCount || 0, description: `预告: ${nextEventTitle}`, icon: GraduationCap },
        { title: "总计签到人次", value: attendedCount || 0, description: "历史成功核销人次", icon: CheckCircle2 },
    ]

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">数据大盘</h2>
                    <p className="text-sm text-muted-foreground mt-1">实时概览俱乐部最近的运营数据和核心指标。</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {metrics.map((metric, i) => (
                    <Card key={i} className="bg-card/50 backdrop-blur-sm shadow-sm transition-all hover:shadow-md hover:border-indigo-500/30">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                            <metric.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{metric.value}</div>
                            <p className="text-xs text-muted-foreground mt-1 truncate">{metric.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                {/* 引入基于 ECharts 的客户端组件 */}
                <Card className="col-span-4 lg:col-span-4 bg-card/50 backdrop-blur-sm shadow-sm">
                    <CardHeader>
                        <CardTitle>社团活力趋势 (近 6 个月)</CardTitle>
                        <CardDescription>月度新增部员与实际下场活动频次的交叉比对图。</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-0">
                        <DashboardCharts data={chartPayload} />
                    </CardContent>
                </Card>

                <Card className="col-span-4 lg:col-span-3 bg-card/50 backdrop-blur-sm shadow-sm">
                    <CardHeader>
                        <CardTitle>最近活动动态</CardTitle>
                        <CardDescription>新晋成员注册与活动发布的实时记录。</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {activities.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">暂无近期动态</p>
                            ) : (
                                activities.map((activity) => (
                                    <div key={activity.id} className="flex flex-row items-start gap-4 group">
                                        <div className="flex-shrink-0 mt-0.5 bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-full transition-transform group-hover:scale-110">
                                            {activity.type === 'member'
                                                ? <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                                : <GraduationCap className="h-4 w-4 text-pink-600 dark:text-pink-400" />}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium leading-none">{activity.action}</p>
                                            <p className="text-xs text-muted-foreground">{activity.dateStr}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
