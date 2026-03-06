"use client"
import * as React from "react"
import { Calendar, MapPin, Clock, Plus, Users, Globe } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast-simple"

type Event = {
    id: string
    title: string
    date: string
    time: string
    location: string
    isOnline: boolean
    description: string
    attendees: number
    type: "工作坊" | "社交" | "讲座"
}

const initialEvents: Event[] = [
    {
        id: "1",
        title: "React Hooks 高级教程",
        date: "2023年10月24日",
        time: "18:00 - 20:00",
        location: "Zoom 链接",
        isOnline: true,
        description: "深入探讨自定义 Hook、useMemo、useCallback 以及性能优化。",
        attendees: 42,
        type: "工作坊"
    },
    {
        id: "2",
        title: "俱乐部迎新晚会",
        date: "2023年10月31日",
        time: "19:00 - 22:00",
        location: "学生活动中心 204室",
        isOnline: false,
        description: "加入我们的学期初迎新晚会！提供免费披萨，结识新朋友。",
        attendees: 120,
        type: "社交"
    },
    {
        id: "3",
        title: "Next.js App Router 架构",
        date: "2023年11月05日",
        time: "17:30 - 19:30",
        location: "计算机楼 101教室",
        isOnline: false,
        description: "行业专家主讲的关于如何扩展 Next.js 应用的客座讲座。",
        attendees: 85,
        type: "讲座"
    }
]

export default function EventsPage() {
    const [events, setEvents] = React.useState<Event[]>(initialEvents)
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const { toast } = useToast()

    const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        const formData = new FormData(e.currentTarget)

        setTimeout(() => {
            const newEvent: Event = {
                id: Math.random().toString(36).substr(2, 9),
                title: formData.get("title") as string,
                date: formData.get("date") as string,
                time: formData.get("time") as string,
                location: formData.get("location") as string,
                isOnline: formData.get("type_loc") === "online",
                description: formData.get("description") as string,
                attendees: 0,
                type: formData.get("type") as "工作坊" | "社交" | "讲座"
            }

            setEvents([newEvent, ...events])
            toast({ title: "活动已创建", description: `"${newEvent.title}" 已成功安排。` })

            setIsSubmitting(false)
            setIsDialogOpen(false)
        }, 800)
    }

    const handleRSVP = (title: string) => {
        toast({ title: "预约已确认", description: `您已成功报名参加 "${title}"。` })
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">活动与课程</h2>
                    <p className="text-sm text-muted-foreground mt-1">即将举办的工作坊、讲座和俱乐部活动。</p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)} className="gap-2 shadow-sm transition-all focus:ring-2">
                    <Plus className="h-4 w-4" /> 创建活动
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                    <Card key={event.id} className="flex flex-col overflow-hidden bg-card/50 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800/60 shadow-sm transition-all hover:shadow-md hover:border-indigo-500/30">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start mb-2">
                                <Badge variant={
                                    event.type === "工作坊" ? "default" :
                                        event.type === "讲座" ? "secondary" : "outline"
                                } className={event.type === "社交" ? "border-amber-500/50 text-amber-600 dark:text-amber-400" : ""}>
                                    {event.type}
                                </Badge>
                                {event.isOnline && (
                                    <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50">
                                        <Globe className="h-3 w-3" /> 线上
                                    </Badge>
                                )}
                            </div>
                            <CardTitle className="text-xl leading-tight">{event.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4">
                            <CardDescription className="text-sm">
                                {event.description}
                            </CardDescription>
                            <div className="space-y-2 mt-4 text-sm text-slate-600 dark:text-slate-400">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-indigo-500 opacity-70" />
                                    <span>{event.date}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-indigo-500 opacity-70" />
                                    <span>{event.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-indigo-500 opacity-70" />
                                    <span className="truncate">{event.location}</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="bg-slate-50/50 dark:bg-zinc-900/50 border-t p-4 flex items-center justify-between">
                            <div className="flex items-center text-xs text-muted-foreground font-medium">
                                <Users className="mr-1.5 h-3.5 w-3.5" />
                                {event.attendees} 人参加
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => handleRSVP(event.title)}>
                                立即报名
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <form onSubmit={handleCreate}>
                        <DialogHeader>
                            <DialogTitle>创建新活动</DialogTitle>
                            <DialogDescription>
                                安排一个新的工作坊、讲座或俱乐部社交活动。
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-5 py-6">
                            <div className="grid gap-2">
                                <Label htmlFor="title">活动标题</Label>
                                <Input id="title" name="title" placeholder="例如：高级 TypeScript" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="date">日期</Label>
                                    <Input id="date" name="date" type="text" placeholder="例如：2023年12月12日" required />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="time">时间</Label>
                                    <Input id="time" name="time" type="text" placeholder="例如：18:00 - 20:00" required />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="location">地点或会议链接</Label>
                                <Input id="location" name="location" placeholder="101室或Zoom链接" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="type">活动类型</Label>
                                    <select id="type" name="type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                        <option value="工作坊">工作坊</option>
                                        <option value="讲座">讲座</option>
                                        <option value="社交">社交</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="type_loc">形式</Label>
                                    <select id="type_loc" name="type_loc" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                        <option value="in_person">线下</option>
                                        <option value="online">线上</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="description">简短描述</Label>
                                <textarea
                                    id="description"
                                    name="description"
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="这个活动是关于什么的？"
                                    required
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "创建中..." : "创建活动"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
