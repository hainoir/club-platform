import * as React from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useUserStore } from "@/store/useUserStore"
import { format } from "date-fns"
import { PostgrestError } from "@supabase/supabase-js"
import { useToast } from "@/components/ui/toast-simple"
import { Event } from "@/app/events/EventsClient"

export function useEvents(initialEvents: Event[]) {
    const router = useRouter()
    const supabase = createClient()
    const { user } = useUserStore()
    const { toast } = useToast()

    const [events, setEvents] = React.useState<Event[]>(initialEvents)

    React.useEffect(() => {
        setEvents(initialEvents)
    }, [initialEvents])

    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [showEndedEvents, setShowEndedEvents] = React.useState(false)
    const [date, setDate] = React.useState<Date>()
    const [editingEvent, setEditingEvent] = React.useState<Event | null>(null)

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

        if (!date) {
            toast({ title: "表单不完整", description: "请选择一个日期。", variant: "destructive" })
            setIsSubmitting(false)
            return
        }

        let startTime = rawTime || '00:00';
        const formattedDate = format(date, 'yyyy-MM-dd')

        let event_date = new Date(`${formattedDate}T${startTime}:00`).toISOString();
        if (event_date === 'Invalid Date') {
            event_date = new Date().toISOString();
        }

        let end_time = null;
        if (rawEndTime) {
            end_time = new Date(`${formattedDate}T${rawEndTime}:00`).toISOString();
        }

        let finalCoverUrl = editingEvent?.coverUrl || null;

        try {
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
            toast({ title: "Login required", description: "Please log in before RSVP.", variant: "destructive" })
            return
        }

        const normalizedEmail = (user.email || "").trim().toLowerCase()
        if (!normalizedEmail) {
            toast({ title: "RSVP failed", description: "Current account has no email.", variant: "destructive" })
            return
        }

        const isAlreadyRSVPd = event.attendeesList?.some((a) => a.user_email?.toLowerCase() === normalizedEmail)

        try {
            if (isAlreadyRSVPd) {
                const { error } = await supabase
                    .from('event_attendees')
                    .delete()
                    .eq('event_id', event.id)
                    .ilike('user_email', normalizedEmail)

                if (error) throw error
                toast({ title: "RSVP canceled", description: 'You have left "' + event.title + '".' })
            } else {
                const { data: existing, error: checkError } = await supabase
                    .from('event_attendees')
                    .select('id')
                    .eq('event_id', event.id)
                    .ilike('user_email', normalizedEmail)
                    .limit(1)

                if (checkError) throw checkError
                if (existing && existing.length > 0) {
                    toast({ title: "Already RSVP'd", description: 'You are already enrolled in "' + event.title + '".' })
                    router.refresh()
                    return
                }

                const { error } = await supabase
                    .from('event_attendees')
                    .insert([{
                        event_id: event.id,
                        user_email: normalizedEmail,
                        user_name: user.name || "Anonymous Member"
                    }])

                if (error) throw error
                toast({ title: "RSVP successful", description: 'You have joined "' + event.title + '".' })
            }
            router.refresh()
        } catch (error: unknown) {
            const pError = error as PostgrestError & { code?: string }
            if (pError.code === '23505') {
                toast({ title: "Already RSVP'd", description: 'Duplicate RSVP request was blocked for "' + event.title + '".' })
                router.refresh()
                return
            }
            toast({ title: "Operation failed", description: pError.message || (error as Error).message || "Unable to complete request", variant: "destructive" })
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

    const isEventEnded = (event: Event) => {
        if (!event.rawDate) return false;
        const compareTime = event.rawEndTime ? event.rawEndTime : event.rawDate;
        return new Date(compareTime) < new Date();
    }

    const normalizedUserEmail = (user?.email || '').trim().toLowerCase();

    const upcomingEvents = events.filter(e => {
        if (isEventEnded(e)) return false;
        if (viewMode === "enrolled" && (!normalizedUserEmail || !e.attendeesList?.some(a => a.user_email?.toLowerCase() === normalizedUserEmail))) return false;
        return true;
    });

    const endedEvents = events.filter(e => {
        if (!isEventEnded(e)) return false;
        if (viewMode === "enrolled" && (!normalizedUserEmail || !e.attendeesList?.some(a => a.user_email?.toLowerCase() === normalizedUserEmail))) return false;
        return true;
    }).sort((a, b) => {
        const timeA = new Date(a.rawEndTime || a.rawDate || 0).getTime();
        const timeB = new Date(b.rawEndTime || b.rawDate || 0).getTime();
        return timeB - timeA;
    });

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

    return {
        events,
        isDialogOpen, setIsDialogOpen,
        isSubmitting,
        showEndedEvents, setShowEndedEvents,
        date, setDate,
        editingEvent,
        isAttendeesDialogOpen, setIsAttendeesDialogOpen,
        viewMode, setViewMode,
        viewingEvent,
        openCreate,
        openEdit,
        handleDelete,
        handleSave,
        handleRSVP,
        openAttendeesList,
        handleRemoveAttendee,
        handleToggleAttendance,
        upcomingEvents,
        endedEvents,
        exportAttendeesToCSV
    }
}
