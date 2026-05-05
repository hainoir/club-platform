'use client';

import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
    formatDutySlot,
    formatPendingLeaveState,
} from './leave-modal-utils';
import type { LeaveWithMember, SwapWithMember } from '@/hooks/useDuty';

interface MyPendingLeavesPanelProps {
    pendingLeaves: LeaveWithMember[];
    swaps: SwapWithMember[];
    respondToSwap: (swapId: string, accept: boolean) => void | Promise<void>;
    rejectSwap: (swapId: string) => void | Promise<void>;
    deletePendingLeave: (leaveId: string) => void | Promise<void>;
    isSwapping: boolean;
    currentUserId?: string;
}

export function MyPendingLeavesPanel({
    pendingLeaves,
    swaps,
    respondToSwap,
    rejectSwap,
    deletePendingLeave,
    isSwapping,
    currentUserId,
}: MyPendingLeavesPanelProps) {
    const myPendingLeaves = useMemo(
        () => pendingLeaves.filter((leave) => leave.member_id === currentUserId),
        [currentUserId, pendingLeaves]
    );

    const swapByLeaveId = useMemo(() => {
        const map = new Map<string, typeof swaps[number]>();
        swaps.forEach((swap) => {
            if (swap.leave_id) {
                map.set(swap.leave_id, swap);
            }
        });
        return map;
    }, [swaps]);

    return (
        <div className="space-y-3 border-t pt-5">
            <div>
                <h4 className="text-sm font-semibold">我发起的待审批请假</h4>
                <p className="text-xs text-muted-foreground">这里可以查看当前状态，并撤回或把定向请求退回大厅。</p>
            </div>

            {myPendingLeaves.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    当前没有待审批请假。
                </div>
            ) : (
                <div className="space-y-2">
                    {myPendingLeaves.map((leave) => {
                        const linkedSwap = swapByLeaveId.get(leave.id);
                        const canReturnToHall = Boolean(linkedSwap?.target_id) && linkedSwap?.status === 'pending';

                        return (
                            <div key={leave.id} className="rounded-md border px-3 py-3">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="space-y-1 text-sm">
                                        <p className="font-medium">{formatDutySlot(leave.day_of_week, leave.period)}</p>
                                        <p className="text-muted-foreground">{formatPendingLeaveState(linkedSwap)}</p>
                                        {leave.reason && (
                                            <p className="text-xs text-muted-foreground">原因：{leave.reason}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {canReturnToHall && linkedSwap && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={isSwapping}
                                                onClick={() => rejectSwap(linkedSwap.id)}
                                            >
                                                退回大厅
                                            </Button>
                                        )}
                                        {linkedSwap ? (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive"
                                                disabled={isSwapping}
                                                onClick={() => respondToSwap(linkedSwap.id, false)}
                                            >
                                                撤回
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive"
                                                disabled={isSwapping}
                                                onClick={() => deletePendingLeave(leave.id)}
                                            >
                                                撤回
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
