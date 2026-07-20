import { isCurrentDutyLeave } from "./duty-time.ts"

export interface DutyLeaveSlotLike {
    id?: string
    member_id: string
    day_of_week: number
    period: number
    status?: string | null
    leave_date?: string
    expires_at?: string
}

export interface DutyRosterSlotLike {
    member_id: string
    day_of_week: number
    period: number
}

export interface DutySwapLeaveLinkLike {
    leave_id?: string | null
}

/**
 * 【学习注释：请假对值班可用性的影响以“已批准”为分界】
 * 只要还是 pending，就不能把成员从排班可用名单里拿掉；
 * 这条规则同时被首页聚合、值班大厅和数据库契约复用。
 */
export function getDutyLeaveSlotKey(memberId: string, dayOfWeek: number, period: number): string {
    return `${memberId}-${dayOfWeek}-${period}`
}

export function buildApprovedLeaveSlotSet(
    leaves: ReadonlyArray<DutyLeaveSlotLike>,
    nowInput: Date | string | number = new Date()
): Set<string> {
    const approved = new Set<string>()

    leaves.forEach((leave) => {
        if (leave.status != null && leave.status !== "approved") return
        if (!leave.leave_date || !leave.expires_at) return
        if (!isCurrentDutyLeave({
            day_of_week: leave.day_of_week,
            period: leave.period,
            leave_date: leave.leave_date,
            expires_at: leave.expires_at,
        }, nowInput)) return
        approved.add(getDutyLeaveSlotKey(leave.member_id, leave.day_of_week, leave.period))
    })

    return approved
}

export function filterRostersForDutyAvailability<T extends DutyRosterSlotLike>(
    rosters: ReadonlyArray<T>,
    approvedLeaves: ReadonlyArray<DutyLeaveSlotLike>,
    nowInput: Date | string | number = new Date()
): T[] {
    const approvedSlotSet = buildApprovedLeaveSlotSet(approvedLeaves, nowInput)
    return rosters.filter(
        (roster) => !approvedSlotSet.has(getDutyLeaveSlotKey(roster.member_id, roster.day_of_week, roster.period))
    )
}

export function buildPendingSwapLeaveIdSet(swaps: ReadonlyArray<DutySwapLeaveLinkLike>): Set<string> {
    const linkedLeaveIds = new Set<string>()

    swaps.forEach((swap) => {
        if (swap.leave_id) {
            linkedLeaveIds.add(swap.leave_id)
        }
    })

    return linkedLeaveIds
}

export function filterPendingLeavesWithoutSwap<T extends DutyLeaveSlotLike>(
    pendingLeaves: ReadonlyArray<T>,
    swaps: ReadonlyArray<DutySwapLeaveLinkLike>
): T[] {
    // 【学习注释：代班关联的请假不能再按“普通待审批请假”展示】
    // 否则管理员会在两个入口里看到同一件事，容易造成重复处理。
    const linkedLeaveIds = buildPendingSwapLeaveIdSet(swaps)
    return pendingLeaves.filter((leave) => !linkedLeaveIds.has(leave.id || ""))
}
