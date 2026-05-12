import * as React from "react"
import { useRouter } from "next/navigation"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { PostgrestError } from "@supabase/supabase-js"
import { useToast } from "@/components/ui/toast-simple"
import type { Event } from "@/components/events/EventsClient"

/**
 * 活动参与者管理
 *
 * 处理查看参与者列表、移除参与者、切换签到状态和导出逗号分隔表。
 */
export function useEventAttendees(
    requireActiveSession: () => Promise<boolean>,
) {
    const router = useRouter()
    const supabase = useSupabase()
    const { toast } = useToast()

    const [isAttendeesDialogOpen, setIsAttendeesDialogOpen] = React.useState(false)
    const [viewingEvent, setViewingEvent] = React.useState<Event | null>(null)

    const openAttendeesList = (event: Event) => {
        setViewingEvent(event)
        setIsAttendeesDialogOpen(true)
    }

    const handleRemoveAttendee = async (attendeeId: string, attendeeName: string) => {
        try {
            if (!(await requireActiveSession())) return
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
            if (!(await requireActiveSession())) return
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
        isAttendeesDialogOpen, setIsAttendeesDialogOpen,
        viewingEvent,
        openAttendeesList,
        handleRemoveAttendee,
        handleToggleAttendance,
        exportAttendeesToCSV,
    }
}
