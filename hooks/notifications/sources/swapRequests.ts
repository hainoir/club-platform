import { formatDutySlot } from "../notification-utils"
import type { AppNotification, NotificationSourceContext } from "../types"

// 管理员视角查询的代班记录字段
interface AdminSwapRow {
    id: string
    original_day: number
    original_period: number
    created_at: string
    requester: { name: string | null } | null
}

// 普通成员视角查询的代班记录字段
interface MemberSwapRow {
    id: string
    requester_id: string
    target_id: string | null
    status: string | null
    original_day: number
    original_period: number
    created_at: string
    requester: { name: string | null } | null
    target: { name: string | null } | null
}

export async function getSwapRequestNotifications({
    supabase,
    user,
    isAdmin,
    swapReminder,
}: NotificationSourceContext): Promise<AppNotification[]> {
    if (!swapReminder) return []

    const swapResult = isAdmin
        ? await supabase
              .from("duty_swaps")
              .select("id, original_day, original_period, created_at, requester:members!duty_swaps_requester_id_fkey(name)")
              .eq("status", "accepted")
              .order("created_at", { ascending: false })
              .limit(6)
        : await supabase
              .from("duty_swaps")
              .select("id, requester_id, target_id, status, original_day, original_period, created_at, requester:members!duty_swaps_requester_id_fkey(name), target:members!duty_swaps_target_id_fkey(name)")
              .in("status", ["pending", "accepted"])
              .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
              .order("created_at", { ascending: false })
              .limit(6)

    const items: AppNotification[] = []

    if (isAdmin) {
        ;(swapResult.data as AdminSwapRow[] || []).forEach((swap) => {
            items.push({
                id: `swap-review-${swap.id}`,
                title: "代班请求待审批",
                description: `${swap.requester?.name || "成员"} 的 ${formatDutySlot(swap.original_day, swap.original_period)} 代班请求等待审批。`,
                href: "/duty",
                createdAt: swap.created_at,
                level: "warning",
            })
        })

        return items
    }

    ;(swapResult.data as MemberSwapRow[] || []).forEach((swap) => {
        const isRequester = swap.requester_id === user.id
        const waitingApproval = swap.status === "accepted"

        if (isRequester) {
            items.push({
                id: `swap-followup-${swap.id}`,
                title: waitingApproval
                    ? "代班已应答，待管理员审批"
                    : swap.target_id
                        ? "定向代班待应答"
                        : "公共代班请求待响应",
                description: `${formatDutySlot(swap.original_day, swap.original_period)} ${
                    waitingApproval
                        ? `已由 ${swap.target?.name || "成员"} 应答`
                        : swap.target_id
                            ? `已定向给 ${swap.target?.name || "成员"}`
                            : "暂时还没有人接单"
                }`,
                href: "/",
                createdAt: swap.created_at,
                level: waitingApproval ? "warning" : "info",
            })
            return
        }

        items.push({
            id: `swap-targeted-${swap.id}`,
            title: waitingApproval ? "你已应答代班，待管理员审批" : "有人定向邀请你代班",
            description: `${swap.requester?.name || "成员"} 邀请你处理 ${formatDutySlot(swap.original_day, swap.original_period)}。`,
            href: "/",
            createdAt: swap.created_at,
            level: waitingApproval ? "info" : "warning",
        })
    })

    return items
}
