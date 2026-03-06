import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Activity, GraduationCap, CircleUserRound } from "lucide-react"

const metrics = [
    { title: "总成员数", value: "1,248", description: "较上月 +12", icon: Users },
    { title: "本周活跃", value: "145", description: "较上周 +8%", icon: Activity },
    { title: "即将举行的活动", value: "3", description: "预告: React Hooks 高级教程", icon: GraduationCap },
]

const recentActivity = [
    { id: 1, action: "用户 A 提交了 React 期末作业", date: "2 小时前" },
    { id: 2, action: "管理员发布了新 React 教程", date: "4 小时前" },
    { id: 3, action: "用户 C 加入了前端俱乐部", date: "1 天前" },
    { id: 4, action: "用户 D 预约了 'Vue 3 Composition API'", date: "2 天前" },
    { id: 5, action: "用户 E 在问答区提了一个问题", date: "3 天前" },
]

export default function Dashboard() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">仪表盘</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {metrics.map((metric, i) => (
                    <Card key={i} className="bg-card/50 backdrop-blur-sm shadow-sm transition-all hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                            <metric.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{metric.value}</div>
                            <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 lg:col-span-5 bg-card/50 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle>最近活动动态</CardTitle>
                        <CardDescription>平台内俱乐部成员和管理员的最新操作记录。</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {recentActivity.map((activity) => (
                                <div key={activity.id} className="flex flex-row items-start gap-4">
                                    <div className="flex-shrink-0 mt-0.5 bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-full">
                                        <CircleUserRound className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">{activity.action}</p>
                                        <p className="text-sm text-muted-foreground">{activity.date}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
