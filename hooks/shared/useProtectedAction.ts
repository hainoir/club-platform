import { useCallback } from "react"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { useUserStore } from "@/store/useUserStore"
import { useToast } from "@/components/ui/toast-simple"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"

/**
 * 【学习注释：横切关注点抽象】
 * 将写操作前的会话校验逻辑抽象为全局钩子。
 * 统一处理失效后的状态清空和弹窗提醒，避免在值班、活动、成员等业务模块中产生冗余样板代码。
 */
export function useProtectedAction() {
    const supabase = useSupabase()
    const { setUser } = useUserStore()
    const { toast } = useToast()

    const requireAuth = useCallback(
        async (customMessage?: string) => {
            try {
                const activeSession = await ensureClientSession(supabase)
                if (activeSession) {
                    return true
                }
            } catch (error) {
                console.warn("Failed to recover auth session before protected action:", error)
            }

            setUser(null)
            toast({
                title: "登录状态已失效",
                description: customMessage || "请重新登录后再进行操作。",
                variant: "destructive",
            })
            return false
        },
        [supabase, setUser, toast]
    )

    const withAuth = useCallback(
        <TArgs extends unknown[], TReturn>(
            action: (...args: TArgs) => Promise<TReturn>,
            customMessage?: string
        ) => {
            return async (...args: TArgs) => {
                const isAuthed = await requireAuth(customMessage)
                if (!isAuthed) return
                return action(...args)
            }
        },
        [requireAuth]
    )

    return { requireAuth, withAuth }
}
