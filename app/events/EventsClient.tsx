"use client"
import * as React from "react"
import { CalendarIcon, MapPin, Clock, Plus, Users, Globe, MoreHorizontal, Pencil, Trash2, Download, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useUserStore, ADMIN_ROLES } from "@/store/useUserStore"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { PostgrestError } from "@supabase/supabase-js"

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
import { EventCard } from "@/components/events/EventCard"
import { EventModal } from "@/components/events/EventModal"
import { AttendeesModal } from "@/components/events/AttendeesModal"

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
    coverUrl?: string
}

interface EventsClientProps {
    initialEvents: Event[]
}

export default function EventsClient({ initialEvents }: EventsClientProps) {
    const router = useRouter()
    const supabase = createClient()
    const { user } = useUserStore()
    const [events, setEvents] = React.useState<Event[]>(initialEvents)

    // 【面试考点：依赖数组 (Dependency Array) 与闭包陷阱】
    // 凡是在 `useEffect` 里用到的外部变量都要填入下方的 `[]` 中。
    // 这里监听了从 Server Component 传来的 initialEvents 变化，并在变化时同步到本组件内部的 events state。
    // 这也是实现无需刷新页面即时展示最新修改结果（通过 server_action 或者 router.refresh() 触发）的核心密码。
    React.useEffect(() => {
        setEvents(initialEvents)
    }, [initialEvents])
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [showEndedEvents, setShowEndedEvents] = React.useState(false) // 切换显示已历史归档的已结束活动
    const { toast } = useToast()

    // 【系统学习：受控组件 (Controlled Components)】
    // 我们将复杂的日历组件 (DatePicker) 绑定到组件状态上。
    const [date, setDate] = React.useState<Date>()
    const [editingEvent, setEditingEvent] = React.useState<Event | null>(null)

    // 管理报名名单弹窗的开闭以及当前正在检阅的活动主体
    const [isAttendeesDialogOpen, setIsAttendeesDialogOpen] = React.useState(false)
    const [viewMode, setViewMode] = React.useState<"all" | "enrolled">("all")
    const [viewingEvent, setViewingEvent] = React.useState<Event | null>(null)

    const openCreate = () => {
        setEditingEvent(null)
        setDate(undefined)
        setIsDialogOpen(true)
    }

    const openEdit = (event: Event) => {
        setEditingEvent(event)

        if (event.rawDate) {
            setDate(new Date(event.rawDate))
        } else {
            // 【系统学习：降级处理 (Fallback)】
            // 当缺失标准时间戳时，尝试用正则粗略抠出中文字符来反序列化为 Date 对象
            const d = event.date.replace(/年|月/g, '-').replace('日', '')
            const parsedDate = new Date(d)
            if (!isNaN(parsedDate.getTime())) {
                setDate(parsedDate)
            } else {
                setDate(undefined)
            }
        }

        setIsDialogOpen(true)
    }

    const handleDelete = async (id: string, title: string) => {
        try {
            const { error } = await supabase.from('events').delete().eq('id', id)
            if (error) throw error;
            toast({ title: "活动已删除", description: `"${title}" 已被取消。`, variant: "destructive" })
            router.refresh()
        } catch (error: unknown) {
            const pError = error as PostgrestError;
            toast({ title: "删除失败", description: pError.message || (error as Error).message, variant: "destructive" })
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
        const coverFile = formData.get("cover") as File | null;

        // 【系统学习：前端表单校验 (Form Validation)】
        // 虽然表单加了 required 属性，但在发起异步请求前，用 JS 做一次硬拦截是防御性编程的体现。
        if (!date) {
            toast({ title: "表单不完整", description: "请选择一个日期。", variant: "destructive" })
            setIsSubmitting(false)
            return
        }

        let startTime = rawTime || '00:00';
        const formattedDate = format(date, 'yyyy-MM-dd')

        let event_date = new Date(`${formattedDate}T${startTime}:00`).toISOString();
        if (event_date === 'Invalid Date') {
            event_date = new Date().toISOString(); // 若非合法字符串，降级回退采用当前时间
        }

        let end_time = null;
        if (rawEndTime) {
            end_time = new Date(`${formattedDate}T${rawEndTime}:00`).toISOString();
        }

        let finalCoverUrl = editingEvent?.coverUrl || null;

        try {
            // 【系统学习：对象存储直传 (Direct Upload)】
            // 发现客户端有真实的 File 时，不去麻烦后端（Next.js API），
            // 直接由客户端直接上传至 Supabase Storage，并将公网返回的 publicUrl 拿出来备用。
            if (coverFile && coverFile.size > 0) {
                const fileExt = coverFile.name.split('.').pop();
                const fileName = `cover_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage.from('events').upload(filePath, coverFile, {
                    cacheControl: '3600',
                    upsert: false
                });

                if (uploadError) {
                    throw new Error(`图片上传失败: ${uploadError.message}`);
                }

                const { data: { publicUrl } } = supabase.storage.from('events').getPublicUrl(filePath);
                finalCoverUrl = publicUrl;
            }

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
                        is_online: isOnline,
                        cover_url: finalCoverUrl
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
                        is_online: isOnline,
                        cover_url: finalCoverUrl
                    }])
                if (error) throw error;
                toast({ title: "活动已创建", description: `"${title}" 已成功安排。` })
            }

            setIsSubmitting(false)
            setIsDialogOpen(false)
            setEditingEvent(null)

            router.refresh()

        } catch (error: unknown) {
            console.error('保存失败:', error);
            const pError = error as PostgrestError;
            toast({ title: "保存失败", description: pError.message || (error as Error).message || "发生未知错误", variant: "destructive" })
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
        } catch (error: unknown) {
            const pError = error as PostgrestError;
            toast({ title: "操作失败", description: pError.message || (error as Error).message || "无法完成请求", variant: "destructive" })
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

            // 【系统学习：乐观更新 (Optimistic UI)】
            // 业界常用的前端体验优化技术。既然接口没报错就说明删成功了，
            // 此时直接修改本地内存中的 `viewingEvent` 状态将其踢出数组，而不去傻等 router.refresh() 的全页数据回归。
            if (viewingEvent) {
                const updatedList = viewingEvent.attendeesList?.filter(a => a.id !== attendeeId)
                setViewingEvent({ ...viewingEvent, attendeesList: updatedList, attendees: (updatedList?.length || 0) })
            }
            router.refresh()
        } catch (error: unknown) {
            const pError = error as PostgrestError;
            toast({ title: "移除失败", description: pError.message || (error as Error).message, variant: "destructive" })
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

            // 【系统学习：不可变数据流 (Immutable Data)】
            // React 严禁直接修改原对象。这里使用 .map() 映射出一个全新的列表，
            // 并把当前操作人的签到状态翻转 (!currentStatus)，以此触发界面的安全重绘。
            if (viewingEvent) {
                const updatedList = viewingEvent.attendeesList?.map(a =>
                    a.id === attendeeId ? { ...a, is_attended: !currentStatus } : a
                )
                setViewingEvent({ ...viewingEvent, attendeesList: updatedList })
            }
            router.refresh()
        } catch (error: unknown) {
            const pError = error as PostgrestError;
            toast({ title: "状态更新失败", description: pError.message || (error as Error).message, variant: "destructive" })
        }
    }

    // 【系统学习：纯函数算子】判断活动是否已结束（基于时间戳比对）
    const isEventEnded = (event: Event) => {
        if (!event.rawDate) return false;
        const compareTime = event.rawEndTime ? event.rawEndTime : event.rawDate;
        return new Date(compareTime) < new Date();
    }

    const upcomingEvents = events.filter(e => {
        if (isEventEnded(e)) return false;
        if (viewMode === "enrolled" && !e.attendeesList?.some(a => a.user_email === user?.email)) return false;
        return true;
    });
    // 将已结束的活动剥离出来，并按结束时间降序排列 (新结束的在最前面)
    const endedEvents = events.filter(e => {
        if (!isEventEnded(e)) return false;
        if (viewMode === "enrolled" && !e.attendeesList?.some(a => a.user_email === user?.email)) return false;
        return true;
    }).sort((a, b) => {
        const timeA = new Date(a.rawEndTime || a.rawDate || 0).getTime();
        const timeB = new Date(b.rawEndTime || b.rawDate || 0).getTime();
        return timeB - timeA;
    });

    const renderEventCard = (event: Event, isEnded: boolean) => (
        <EventCard
            key={event.id}
            event={event}
            isEnded={isEnded}
            isAdmin={ADMIN_ROLES.includes(user?.role || '')}
            currentUserEmail={user?.email}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAttendeesClick={openAttendeesList}
            onRSVP={handleRSVP}
        />
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex space-x-1 bg-muted/50 p-1 rounded-lg border">
                        <Button
                            variant={viewMode === "all" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("all")}
                            className="rounded-md text-xs sm:text-sm"
                        >
                            活动大厅
                        </Button>
                        <Button
                            variant={viewMode === "enrolled" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("enrolled")}
                            className="rounded-md text-xs sm:text-sm disabled:opacity-50"
                            disabled={!user}
                        >
                            我的报名 {!user && '(未登录)'}
                        </Button>
                    </div>
                    {ADMIN_ROLES.includes(user?.role || '') && (
                        <Button onClick={openCreate} className="gap-2 shadow-sm transition-all focus:ring-2">
                            <Plus className="h-4 w-4" /> 创建活动
                        </Button>
                    )}
                </div>
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

            <EventModal
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSave={handleSave}
                editingEvent={editingEvent}
                isSubmitting={isSubmitting}
                date={date}
                setDate={setDate}
            />

            <AttendeesModal
                isOpen={isAttendeesDialogOpen}
                onClose={() => setIsAttendeesDialogOpen(false)}
                viewingEvent={viewingEvent}
                isAdmin={ADMIN_ROLES.includes(user?.role || '')}
                onExport={exportAttendeesToCSV}
                onToggleAttendance={handleToggleAttendance}
                onRemoveAttendee={handleRemoveAttendee}
            />
        </div>
    )
}
