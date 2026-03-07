import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Activity, GraduationCap, CircleUserRound, CheckCircle2 } from "lucide-react"
import { createClient } from "@/utils/supabase/server"
import { format, isAfter, subMonths, startOfMonth, endOfMonth } from "date-fns"
import { zhCN } from "date-fns/locale"
import DashboardCharts from "./DashboardCharts"
import DashboardPie from "./DashboardPie"
import DashboardAttendance from "./DashboardAttendance"

/**
 * 【面试考点：React Server Components (RSC) 与服务端直出】
 * 这是一个 Next.js 15 的服务端组件。它没有写 'use client'。
 * 优势1: 所有的 supabase 查询都在服务器端执行，不消耗用户的手机算力，也不会暴露数据库结构。
 * 优势2: 组件最终会被生成为纯 HTML 片段返回给浏览器，首屏渲染 (FCP) 快到极致，SEO 极佳。
 * 优势3: 我们在这里进行了大约 7~8 次不同维度的数据库查询，它们几乎是在服务端“内网”里秒级完成的并发查询，完全去除了前端瀑布流拉数据的弊端。
 */
export default async function Dashboard() {
    // 实例化面向服务端的 Supabase 游标
    const supabase = await createClient()

    const now = new Date().toISOString()

    // 1. 并发执行第一批所有的独立聚合及列表查询
    const [
        { count: totalMembers },
        { count: activeMembers },
        { data: upcomingEvents, count: upcomingCount },
        { count: attendedCount },
        { data: newMembers },
        { data: recentEvents },
        { data: deptData },
        { data: recentAttendEvents }
    ] = await Promise.all([
        supabase.from('members').select('*', { count: 'exact', head: true }),
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('events').select('title, event_date', { count: 'exact' }).gt('event_date', now).order('event_date', { ascending: true }),
        supabase.from('event_attendees').select('*', { count: 'exact', head: true }).eq('is_attended', true),
        supabase.from('members').select('name, join_date').order('join_date', { ascending: false }).limit(3),
        supabase.from('events').select('title, created_at').order('created_at', { ascending: false }).limit(3),
        supabase.from('members').select('department'),
        supabase.from('events').select('title, event_attendees(is_attended)').lt('event_date', now).order('event_date', { ascending: false }).limit(5)
    ])

    const nextEventTitle = upcomingEvents && upcomingEvents.length > 0
        ? upcomingEvents[0].title
        : "暂无预告"

    // ========================================
    // 数据流缝合 (Recent Activity)
    // ========================================

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
    // 【面试考点：数据结构的变形派生 (Data Transformation)】
    // 为了满足 Echarts 双折线图的需求，我们在服务端将关系型数据库的数据
    // '打平' 成三个并行的一维数组: labels(X轴), members(Y1), events(Y2)。
    // 这比在前端浏览器里循环计算性能要高出非常多。
    const chartLabels: string[] = []
    const newMembersData: number[] = []
    const eventsData: number[] = []

    const historyPromises: any[] = []

    for (let i = 5; i >= 0; i--) {
        const targetDate = subMonths(new Date(), i)
        // format nicely as "10月"
        chartLabels.push(format(targetDate, 'MMM', { locale: zhCN }))

        const start = startOfMonth(targetDate).toISOString()
        const end = endOfMonth(targetDate).toISOString()

        historyPromises.push(supabase.from('members').select('*', { count: 'exact', head: true }).gte('join_date', start).lte('join_date', end))
        historyPromises.push(supabase.from('events').select('*', { count: 'exact', head: true }).gte('event_date', start).lte('event_date', end))
    }

    const historyResults = await Promise.all(historyPromises)

    for (let i = 0; i < 6; i++) {
        newMembersData.push(historyResults[i * 2]?.count || 0)
        eventsData.push(historyResults[i * 2 + 1]?.count || 0)
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

    // 5. 部门分布 (Pie Chart Data)
    const deptCount: Record<string, number> = {};
    deptData?.forEach(m => {
        const dept = m.department || '未分配';
        deptCount[dept] = (deptCount[dept] || 0) + 1;
    });
    const pieData = Object.entries(deptCount).map(([name, value]) => ({ name, value }));

    // 6. 出勤率 (Attendance Data: 最近 5 场已结束活动)
    // （数据已在顶部通过 Promise.all 并发获取至 recentAttendEvents）

    const attendanceData = (recentAttendEvents || []).map(e => {
        const attendees = e.event_attendees as any[] || [];
        const total = attendees.length;
        const attended = attendees.filter(a => a.is_attended).length;
        const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
        return {
            name: e.title.length > 7 ? e.title.substring(0, 7) + '...' : e.title,
            rate: rate
        };
    }).reverse();

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

            {/* 新增的深度数据图表排版 */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 lg:col-span-3 bg-card/50 backdrop-blur-sm shadow-sm">
                    <CardHeader>
                        <CardTitle>各科室编制概况</CardTitle>
                        <CardDescription>各部门现存成员人数及占比流向图。</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DashboardPie data={pieData} />
                    </CardContent>
                </Card>

                <Card className="col-span-4 lg:col-span-4 bg-card/50 backdrop-blur-sm shadow-sm">
                    <CardHeader>
                        <CardTitle>近期历史活动签到核销率</CardTitle>
                        <CardDescription>最近 5 场历史活动的实际出勤人员占比直方图。</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DashboardAttendance data={attendanceData} />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
