import * as React from "react"
import { useRouter } from "next/navigation"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { PostgrestError } from "@supabase/supabase-js"
import { useToast } from "@/components/ui/toast-simple"
import type { Event } from "@/components/events/EventsClient"
import { eventDateTimeToISOString, eventTimestampToCalendarDate, getEventCalendarDateKey } from "@/lib/events/event-time"

const COVER_MAX_BYTES = 5 * 1024 * 1024
const COVER_EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

function storagePathFromPublicUrl(url: string | null | undefined): string | null {
    if (!url) return null
    const marker = "/storage/v1/object/public/events/"
    const markerIndex = url.indexOf(marker)
    if (markerIndex === -1) return null
    const rawPath = url.slice(markerIndex + marker.length).split(/[?#]/, 1)[0]
    try {
        return decodeURIComponent(rawPath)
    } catch {
        return null
    }
}

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
            setDate(eventTimestampToCalendarDate(event.rawDate))
        } else {
            const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(event.date)
            setDate(match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined)
        }
        setIsDialogOpen(true)
    }

    const handleDelete = async (id: string, title: string) => {
        try {
            if (!(await requireActiveSession())) return
            const { data: event } = await supabase.from('events').select('cover_url').eq('id', id).maybeSingle()
            const { error } = await supabase.from('events').delete().eq('id', id)
            if (error) throw error;
            const coverPath = storagePathFromPublicUrl(event?.cover_url)
            if (coverPath) await supabase.storage.from('events').remove([coverPath])
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

        const formattedDate = getEventCalendarDateKey(date)
        const startTime = rawTime || '00:00'
        let event_date: string
        let end_time: string | null = null
        try {
            event_date = eventDateTimeToISOString(formattedDate, startTime, "开始时间")
            if (rawEndTime) {
                end_time = eventDateTimeToISOString(formattedDate, rawEndTime, "结束时间")
                if (new Date(end_time).getTime() <= new Date(event_date).getTime()) {
                    throw new Error("结束时间必须晚于开始时间。")
                }
            }
        } catch (error) {
            toast({ title: "时间无效", description: (error as Error).message, variant: "destructive" })
            setIsSubmitting(false)
            return
        }

        let finalCoverUrl = editingEvent?.coverUrl || null;
        let uploadedCoverPath: string | null = null

        try {
            if (!(await requireActiveSession())) {
                setIsSubmitting(false)
                return
            }
            if (coverFile && coverFile.size > 0) {
                const fileExt = COVER_EXTENSIONS[coverFile.type]
                if (!fileExt) {
                    throw new Error("封面仅支持 JPG、PNG 或 WebP 图片。")
                }
                if (coverFile.size > COVER_MAX_BYTES) {
                    throw new Error("封面图片不能超过 5 MB。")
                }
                const fileName = `cover_${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage.from('events').upload(filePath, coverFile, {
                    cacheControl: '3600',
                    upsert: false
                });

                if (uploadError) {
                    throw new Error(`图片上传失败: ${uploadError.message}`);
                }
                uploadedCoverPath = filePath

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
                const previousCoverPath = storagePathFromPublicUrl(editingEvent.coverUrl)
                if (uploadedCoverPath && previousCoverPath && previousCoverPath !== uploadedCoverPath) {
                    await supabase.storage.from('events').remove([previousCoverPath])
                }
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
            if (uploadedCoverPath) {
                await supabase.storage.from('events').remove([uploadedCoverPath])
            }
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
