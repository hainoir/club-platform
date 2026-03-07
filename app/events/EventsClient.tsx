"use client"
import * as React from "react"
import { CalendarIcon, MapPin, Clock, Plus, Users, Globe, MoreHorizontal, Pencil, Trash2, Download, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useUserStore, ADMIN_ROLES } from "@/store/useUserStore"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast-simple"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type Attendee = {
    id: string
    user_email: string
    user_name: string
    is_attended?: boolean
}

export type Event = {
    id: string
    title: string
    date: string
    time: string
    endTime?: string
    rawDate?: string
    rawEndTime?: string | null
    location: string
    isOnline: boolean
    description: string
    attendees: number
    attendeesList?: Attendee[]
    type: string
}

interface EventsClientProps {
    initialEvents: Event[]
}

export default function EventsClient({ initialEvents }: EventsClientProps) {
    const router = useRouter()
    const supabase = createClient()
    const { user } = useUserStore()
    const [events, setEvents] = React.useState<Event[]>(initialEvents)

    // Sync local state when server component passes down new data via router.refresh()
    React.useEffect(() => {
        setEvents(initialEvents)
    }, [initialEvents])
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [showEndedEvents, setShowEndedEvents] = React.useState(false) // toggle for ended events
    const { toast } = useToast()

    // Controlled state for DatePicker
    const [date, setDate] = React.useState<Date>()
    const [editingEvent, setEditingEvent] = React.useState<Event | null>(null)

    // State for Attendees Management Dialog
    const [isAttendeesDialogOpen, setIsAttendeesDialogOpen] = React.useState(false)
    const [viewingEvent, setViewingEvent] = React.useState<Event | null>(null)

    const openCreate = () => {
        setEditingEvent(null)
        setDate(undefined)
        setIsDialogOpen(true)
    }

    const openEdit = (event: Event) => {
        setEditingEvent(event)

        // Helper: roughly parse "2026年3月15日" to a Date object
        const d = event.date.replace(/年|月/g, '-').replace('日', '')
        const parsedDate = new Date(d)
        if (!isNaN(parsedDate.getTime())) {
            setDate(parsedDate)
        } else {
            setDate(undefined)
        }

        setIsDialogOpen(true)
    }

    const handleDelete = async (id: string, title: string) => {
        try {
            const { error } = await supabase.from('events').delete().eq('id', id)
            if (error) throw error;
            toast({ title: "活动已删除", description: `"${title}" 已被取消。`, variant: "destructive" })
            router.refresh()
        } catch (error: any) {
            toast({ title: "删除失败", description: error.message, variant: "destructive" })
        }
    }

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSubmitting(true)
        const formData = new FormData(e.currentTarget)

        const title = formData.get("title") as string;
        const rawTime = formData.get("time") as string;
        const rawEndTime = formData.get("endTime") as string;
        const location = formData.get("location") as string;
        const description = formData.get("description") as string;
        const type = formData.get("type") as string;
        const isOnline = formData.get("type_loc") === "online";

        // If user didn't select a date, require it
        if (!date) {
            toast({ title: "表单不完整", description: "请选择一个日期。", variant: "destructive" })
            setIsSubmitting(false)
            return
        }

        let startTime = rawTime || '00:00';
        const formattedDate = format(date, 'yyyy-MM-dd')

        let event_date = new Date(`${formattedDate}T${startTime}:00`).toISOString();
        if (event_date === 'Invalid Date') {
            event_date = new Date().toISOString(); // fallback
        }

        let end_time = null;
        if (rawEndTime) {
            end_time = new Date(`${formattedDate}T${rawEndTime}:00`).toISOString();
        }

        try {
            if (editingEvent) {
                const { error } = await supabase
                    .from('events')
                    .update({
                        title: title,
                        description: description,
                        event_date: event_date,
                        end_time: end_time,
                        location: location,
                        type: type,
                        is_online: isOnline
                    })
                    .eq('id', editingEvent.id)
                if (error) throw error;
                toast({ title: "活动已更新", description: `"${title}" 的信息已成功更新。` })
            } else {
                const { error } = await supabase
                    .from('events')
                    .insert([{
                        title: title,
                        description: description,
                        event_date: event_date,
                        end_time: end_time,
                        location: location,
                        type: type,
                        is_online: isOnline
                    }])
                if (error) throw error;
                toast({ title: "活动已创建", description: `"${title}" 已成功安排。` })
            }

            setIsSubmitting(false)
            setIsDialogOpen(false)
            setEditingEvent(null)

            router.refresh()

        } catch (error: any) {
            console.error('保存失败:', error);
            toast({ title: "保存失败", description: error.message || "发生未知错误", variant: "destructive" })
            setIsSubmitting(false)
        }
    }

    const handleRSVP = async (event: Event) => {
        if (!user) {
            toast({ title: "需要登录", description: "请先登录以报名参加活动。", variant: "destructive" })
            return
        }

        const isAlreadyRSVPd = event.attendeesList?.some(a => a.user_email === user.email)

        try {
            if (isAlreadyRSVPd) {
                // 取消报名
                const { error } = await supabase
                    .from('event_attendees')
                    .delete()
                    .match({ event_id: event.id, user_email: user.email })

                if (error) throw error
                toast({ title: "已取消报名", description: `您已退出 "${event.title}"` })
            } else {
                // 参加报名
                const { error } = await supabase
                    .from('event_attendees')
                    .insert([{
                        event_id: event.id,
                        user_email: user.email,
                        user_name: user.name || "匿名成员"
                    }])

                if (error) throw error
                toast({ title: "报名成功", description: `您已成功报名参加 "${event.title}"！` })
            }
            router.refresh()
        } catch (error: any) {
            toast({ title: "操作失败", description: error.message || "无法完成请求", variant: "destructive" })
        }
    }

    const openAttendeesList = (event: Event) => {
        setViewingEvent(event)
        setIsAttendeesDialogOpen(true)
    }

    const handleRemoveAttendee = async (attendeeId: string, attendeeName: string) => {
        try {
            const { error } = await supabase
                .from('event_attendees')
                .delete()
                .eq('id', attendeeId)

            if (error) throw error
            toast({ title: "移除成功", description: `已将 ${attendeeName} 从活动名单中移除。` })

            // Optimistically update the UI if viewingEvent is open
            if (viewingEvent) {
                const updatedList = viewingEvent.attendeesList?.filter(a => a.id !== attendeeId)
                setViewingEvent({ ...viewingEvent, attendeesList: updatedList, attendees: (updatedList?.length || 0) })
            }
            router.refresh()
        } catch (error: any) {
            toast({ title: "移除失败", description: error.message, variant: "destructive" })
        }
    }

    const handleToggleAttendance = async (attendeeId: string, currentStatus: boolean, attendeeName: string) => {
        try {
            const { error } = await supabase
                .from('event_attendees')
                .update({ is_attended: !currentStatus })
                .eq('id', attendeeId)

            if (error) throw error
            toast({ title: "状态更改", description: `已将 ${attendeeName} 标记为 ${!currentStatus ? '已签到' : '未签到'}。` })

            if (viewingEvent) {
                const updatedList = viewingEvent.attendeesList?.map(a =>
                    a.id === attendeeId ? { ...a, is_attended: !currentStatus } : a
                )
                setViewingEvent({ ...viewingEvent, attendeesList: updatedList })
            }
            router.refresh()
        } catch (error: any) {
            toast({ title: "状态更新失败", description: error.message, variant: "destructive" })
        }
    }

    // Determine event status
    const isEventEnded = (event: Event) => {
        if (!event.rawDate) return false;
        const compareTime = event.rawEndTime ? event.rawEndTime : event.rawDate;
        return new Date(compareTime) < new Date();
    }

    const upcomingEvents = events.filter(e => !isEventEnded(e));
    // Sort ended events: newest ended first
    const endedEvents = events.filter(e => isEventEnded(e)).sort((a, b) => {
        const timeA = new Date(a.rawEndTime || a.rawDate || 0).getTime();
        const timeB = new Date(b.rawEndTime || b.rawDate || 0).getTime();
        return timeB - timeA;
    });

    const renderEventCard = (event: Event, isEnded: boolean) => (
        <Card key={event.id} className={cn(
            "flex flex-col overflow-hidden bg-card/50 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800/60 shadow-sm transition-all hover:shadow-md",
            isEnded ? "opacity-70 grayscale-[30%]" : "hover:border-indigo-500/30"
        )}>
            <CardHeader className="pb-4">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2 items-center">
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
                        {isEnded && (
                            <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">已结束</Badge>
                        )}
                    </div>
                    {ADMIN_ROLES.includes(user?.role || '') && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mt-2 -mr-2">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">打开菜单</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[160px]">
                                <DropdownMenuItem onClick={() => openEdit(event)}>
                                    <Pencil className="mr-2 h-4 w-4" /> 编辑活动
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:bg-destructive focus:text-destructive-foreground" onClick={() => handleDelete(event.id, event.title)}>
                                    <Trash2 className="mr-2 h-4 w-4" /> 移除活动
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
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
                        <CalendarIcon className="h-4 w-4 text-indigo-500 opacity-70" />
                        <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-indigo-500 opacity-70" />
                        <span>{event.time}{event.endTime ? ` - ${event.endTime}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-indigo-500 opacity-70" />
                        <span className="truncate">{event.location}</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="bg-slate-50/50 dark:bg-zinc-900/50 border-t p-4 flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center text-xs text-muted-foreground font-medium hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-2 -ml-2 transition-colors cursor-pointer"
                    onClick={() => openAttendeesList(event)}
                >
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    {event.attendees} 人参加
                </Button>

                <Button
                    size="sm"
                    variant={isEnded ? "secondary" : event.attendeesList?.some(a => a.user_email === user?.email) ? "outline" : "secondary"}
                    onClick={isEnded ? undefined : () => handleRSVP(event)}
                    className="transition-all"
                    disabled={isEnded}
                >
                    {isEnded ? "报名截止" : (event.attendeesList?.some(a => a.user_email === user?.email) ? "取消报名" : "立即报名")}
                </Button>
            </CardFooter>
        </Card>
    );

    const exportAttendeesToCSV = () => {
        if (!viewingEvent || !viewingEvent.attendeesList || viewingEvent.attendeesList.length === 0) {
            toast({ title: "导出失败", description: "当前活动暂无人报名。", variant: "destructive" })
            return;
        }

        const BOM = "\uFEFF";
        const header = ["姓名", "关联邮箱", "签到状态"].join(",");

        const rows = viewingEvent.attendeesList.map(a => {
            const status = a.is_attended ? "已签到" : "未签到";
            return `"${a.user_name}","${a.user_email}","${status}"`;
        });

        const csvContent = BOM + [header, ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${viewingEvent.title}_报名名单_${new Date().toLocaleDateString('zh-CN')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">活动与课程</h2>
                    <p className="text-sm text-muted-foreground mt-1">即将举办的工作坊、讲座和俱乐部活动。</p>
                </div>
                {ADMIN_ROLES.includes(user?.role || '') && (
                    <Button onClick={openCreate} className="gap-2 shadow-sm transition-all focus:ring-2">
                        <Plus className="h-4 w-4" /> 创建活动
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg bg-card/30">
                        <CalendarIcon className="h-12 w-12 mx-auto opacity-20 mb-3" />
                        <p>近期暂无即将举办的活动。</p>
                    </div>
                ) : (
                    upcomingEvents.map(e => renderEventCard(e, false))
                )}
            </div>

            {endedEvents.length > 0 && (
                <div className="pt-8 mt-8 border-t border-slate-200 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-semibold opacity-80 flex items-center gap-2">
                            <Clock className="h-5 w-5" /> 历史长廊
                        </h3>
                        <Button variant="outline" size="sm" onClick={() => setShowEndedEvents(!showEndedEvents)}>
                            {showEndedEvents ? "隐藏已结束活动" : `查看已结束的 ${endedEvents.length} 个活动`}
                        </Button>
                    </div>

                    {showEndedEvents && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            {endedEvents.map(e => renderEventCard(e, true))}
                        </div>
                    )}
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <form onSubmit={handleSave}>
                        <DialogHeader>
                            <DialogTitle>{editingEvent ? "编辑活动" : "创建新活动"}</DialogTitle>
                            <DialogDescription>
                                {editingEvent ? "修改当前活动的详细信息与时间。" : "安排一个新的工作坊、讲座或俱乐部社交活动。"}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-5 py-6">
                            <div className="grid gap-2">
                                <Label htmlFor="title">活动标题</Label>
                                <Input id="title" name="title" placeholder="例如：高级 TypeScript" defaultValue={editingEvent?.title} required />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>日期</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full justify-start text-left font-normal bg-background",
                                                    !date && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {date ? format(date, "PPP") : <span>选择一个日期</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={date}
                                                onSelect={setDate}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="time">开始时间</Label>
                                        <Input id="time" name="time" type="time" defaultValue={editingEvent?.time} required />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="endTime">结束时间</Label>
                                        <Input id="endTime" name="endTime" type="time" defaultValue={editingEvent?.endTime} />
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="location">地点或会议链接</Label>
                                <Input id="location" name="location" placeholder="101室或Zoom链接" defaultValue={editingEvent?.location} required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="type">活动类型</Label>
                                    <select id="type" name="type" defaultValue={editingEvent?.type || "工作坊"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                        <option value="工作坊">工作坊</option>
                                        <option value="讲座">讲座</option>
                                        <option value="社交">社交</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="type_loc">形式</Label>
                                    <select id="type_loc" name="type_loc" defaultValue={editingEvent?.isOnline ? "online" : "in_person"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
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
                                    defaultValue={editingEvent?.description}
                                    required
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "保存中..." : "保存记录"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isAttendeesDialogOpen} onOpenChange={setIsAttendeesDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex justify-between items-center pr-6">
                            <span>报名名单：{viewingEvent?.title}</span>
                            {ADMIN_ROLES.includes(user?.role || '') && (
                                <Button onClick={exportAttendeesToCSV} variant="outline" size="sm" className="h-8 gap-1.5 px-3">
                                    <Download className="h-3.5 w-3.5" />
                                    导出名单
                                </Button>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            目前共有 {viewingEvent?.attendees} 人报名参加此活动。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
                        {(!viewingEvent?.attendeesList || viewingEvent.attendeesList.length === 0) ? (
                            <p className="text-sm text-center text-muted-foreground py-4">暂无人员报名</p>
                        ) : (
                            viewingEvent.attendeesList.map((attendee) => (
                                <div key={attendee.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors">
                                    <div>
                                        <p className="text-sm font-medium leading-none flex items-center gap-2">
                                            {attendee.user_name}
                                            {attendee.is_attended && <Badge variant="outline" className="text-[10px] h-6 px-1.5 bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400">已签到</Badge>}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">{attendee.user_email}</p>
                                    </div>
                                    {ADMIN_ROLES.includes(user?.role || '') && (
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title={attendee.is_attended ? "撤销签到" : "标记为已签到"}
                                                className={cn("h-8 w-8", attendee.is_attended ? "text-emerald-500 hover:text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100" : "text-slate-400 hover:text-slate-600")}
                                                onClick={() => handleToggleAttendance(attendee.id, !!attendee.is_attended, attendee.user_name)}
                                            >
                                                <CheckCircle2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground"
                                                onClick={() => handleRemoveAttendee(attendee.id, attendee.user_name)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
