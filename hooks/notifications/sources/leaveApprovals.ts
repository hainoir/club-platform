import { filterPendingLeavesWithoutSwap } from "@/lib/duty/duty-leaves"

import { formatDutySlot } from "../notification-utils"
import type { AppNotification, NotificationSourceContext } from "../types"

type PendingLeaveNotificationRow = {
    id?: string
    member_id: string
    day_of_week: number
    period: number
    created_at?: string
    member?: { name?: string | null } | null
}

export async function getLeaveApprovalNotifications({
    supabase,
    user,
    isAdmin,
    now,
    dutyReminder,
}: NotificationSourceContext): Promise<AppNotification[]> {
    if (!dutyReminder) return []

    const [pendingLeavesResult, pendingSwapLeaveLinksResult] = await Promise.all([
        isAdmin
            ? supabase
                  .from("duty_leaves")
                  .select("id, member_id, day_of_week, period, created_at, member:members!duty_leaves_member_id_fkey(name)")
                  .eq("status", "pending")
                  .order("created_at", { ascending: false })
                  .limit(12)
            : supabase
                  .from("duty_leaves")
                  .select("id, member_id, day_of_week, period, created_at")
                  .eq("status", "pending")
                  .eq("member_id", user.id)
                  .order("created_at", { ascending: false })
                  .limit(12),
        isAdmin
            ? supabase.from("duty_swaps").select("leave_id").in("status", ["pending", "accepted"])
            : supabase.from("duty_swaps").select("leave_id").in("status", ["pending", "accepted"]).eq("requester_id", user.id),
    ])

    const pendingDirectLeaves = filterPendingLeavesWithoutSwap(
        (pendingLeavesResult.data || []) as PendingLeaveNotificationRow[],
        (pendingSwapLeaveLinksResult.data || []) as Array<{ leave_id?: string | null }>
    )

    if (isAdmin) {
        return pendingDirectLeaves.slice(0, 6).map((leave: PendingLeaveNotificationRow) => ({
            id: `leave-review-${leave.id}`,
            title: "请假请求待审批",
            description: `${leave.member?.name || "成员"} 的 ${formatDutySlot(leave.day_of_week, leave.period)} 请假等待审批。`,
            href: "/duty",
            createdAt: leave.created_at || now.toISOString(),
            level: "warning",
        }))
    }

    return pendingDirectLeaves.slice(0, 6).map((leave: PendingLeaveNotificationRow) => ({
        id: `leave-followup-${leave.id}`,
        title: "请假待管理员审批",
        description: `${formatDutySlot(leave.day_of_week, leave.period)} 暂未生效，等待管理员审批。`,
        href: "/",
        createdAt: leave.created_at || now.toISOString(),
        level: "info",
    }))
}
