export interface DutyLeaveSlotLike {
    id?: string
    member_id: string
    day_of_week: number
    period: number
    status?: string | null
}

export interface DutyRosterSlotLike {
    member_id: string
    day_of_week: number
    period: number
}

export interface DutySwapLeaveLinkLike {
    leave_id?: string | null
}

export function getDutyLeaveSlotKey(memberId: string, dayOfWeek: number, period: number): string {
    return `${memberId}-${dayOfWeek}-${period}`
}

export function buildApprovedLeaveSlotSet(leaves: ReadonlyArray<DutyLeaveSlotLike>): Set<string> {
    const approved = new Set<string>()

    leaves.forEach((leave) => {
        if (leave.status != null && leave.status !== "approved") return
        approved.add(getDutyLeaveSlotKey(leave.member_id, leave.day_of_week, leave.period))
    })

    return approved
}

export function filterRostersForDutyAvailability<T extends DutyRosterSlotLike>(
    rosters: ReadonlyArray<T>,
    approvedLeaves: ReadonlyArray<DutyLeaveSlotLike>
): T[] {
    const approvedSlotSet = buildApprovedLeaveSlotSet(approvedLeaves)
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
    const linkedLeaveIds = buildPendingSwapLeaveIdSet(swaps)
    return pendingLeaves.filter((leave) => !linkedLeaveIds.has(leave.id || ""))
}
