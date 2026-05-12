import * as React from "react"
import { useRouter } from "next/navigation"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { format } from "date-fns"
import { PostgrestError } from "@supabase/supabase-js"
import { useToast } from "@/components/ui/toast-simple"
import type { Event } from "@/components/events/EventsClient"

/**
 * 活动增删改查操作
 *
 * 处理活动的创建、编辑、删除和表单状态管理。
 */
export function useEventCRUD(
    requireActiveSession: () => Promise<boolean>,
) {
    const router = useRouter()
    const supabase = useSupabase()
    const { toast } = useToast()

    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [date, setDate] = React.useState<Date>()
    const [editingEvent, setEditingEvent] = React.useState<Event | null>(null)

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
            if (!(await requireActiveSession())) return
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
            if (!(await requireActiveSession())) {
                setIsSubmitting(false)
                return
            }
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

    return {
        isDialogOpen, setIsDialogOpen,
        isSubmitting,
        date, setDate,
        editingEvent,
        openCreate,
        openEdit,
        handleDelete,
        handleSave,
    }
}
