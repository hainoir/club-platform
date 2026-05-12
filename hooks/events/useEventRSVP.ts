import { useRouter } from "next/navigation"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { useUserStore } from "@/store/useUserStore"
import { PostgrestError } from "@supabase/supabase-js"
import { useToast } from "@/components/ui/toast-simple"
import type { Event } from "@/components/events/EventsClient"

/**
 * 活动报名响应（RSVP）操作
 *
 * 处理报名、取消报名，包括去重检查和并发冲突处理。
 */
export function useEventRSVP(
    requireActiveSession: () => Promise<boolean>,
) {
    const router = useRouter()
    const supabase = useSupabase()
    const { user } = useUserStore()
    const { toast } = useToast()

    const handleRSVP = async (event: Event) => {
        if (!user) {
            toast({ title: "请先登录", description: "请登录后再进行活动报名。", variant: "destructive" })
            return
        }

        const normalizedEmail = (user.email || "").trim().toLowerCase()
        if (!normalizedEmail) {
            toast({ title: "报名失败", description: "当前账号未关联邮箱，无法报名。", variant: "destructive" })
            return
        }

        const isAlreadyRSVPd = event.attendeesList?.some((a) => a.user_email?.toLowerCase() === normalizedEmail)

        try {
            if (!(await requireActiveSession())) return
            if (isAlreadyRSVPd) {
                const { error } = await supabase
                    .from('event_attendees')
                    .delete()
                    .eq('event_id', event.id)
                    .ilike('user_email', normalizedEmail)

                if (error) throw error
                toast({ title: "已取消报名", description: `已退出「${event.title}」。` })
            } else {
                const { data: existing, error: checkError } = await supabase
                    .from('event_attendees')
                    .select('id')
                    .eq('event_id', event.id)
                    .ilike('user_email', normalizedEmail)
                    .limit(1)

                if (checkError) throw checkError
                if (existing && existing.length > 0) {
                    toast({ title: "已报名", description: `您已报名「${event.title}」，无需重复操作。` })
                    router.refresh()
                    return
                }

                const { error } = await supabase
                    .from('event_attendees')
                    .insert([{
                        event_id: event.id,
                        user_email: normalizedEmail,
                        user_name: user.name || "匿名成员"
                    }])

                if (error) throw error
                toast({ title: "报名成功", description: `已成功加入「${event.title}」。` })
            }
            router.refresh()
        } catch (error: unknown) {
            const pError = error as PostgrestError & { code?: string }
            if (pError.code === '23505') {
                toast({ title: "已报名", description: `「${event.title}」的重复报名请求已被拦截。` })
                router.refresh()
                return
            }
            toast({ title: "操作失败", description: pError.message || (error as Error).message || "无法完成请求，请稍后重试。", variant: "destructive" })
        }
    }

    return { handleRSVP }
}
