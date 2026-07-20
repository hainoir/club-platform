'use client';

import { useMemo } from 'react';

import { UserCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatDutySlot } from './leave-modal-utils';
import type { LeaveWithMember, SwapWithMember } from '@/hooks/useDuty';
import { filterPendingLeavesWithoutSwap } from '@/lib/duty/duty-leaves';

interface LeaveAdminReviewProps {
    pendingLeaves: LeaveWithMember[];
    swaps: SwapWithMember[];
    approvePendingLeave: (leaveId: string) => void | Promise<void>;
    deletePendingLeave: (
        leaveId: string,
        options?: { title?: string; description?: string }
    ) => void | Promise<void>;
    isSwapping: boolean;
    canReview: boolean;
}

export function LeaveAdminReview({
    pendingLeaves,
    swaps,
    approvePendingLeave,
    deletePendingLeave,
    isSwapping,
    canReview,
}: LeaveAdminReviewProps) {
    const adminPendingDirectLeaves = useMemo(() => {
        if (!canReview) return [];
        return filterPendingLeavesWithoutSwap(pendingLeaves, swaps);
    }, [canReview, pendingLeaves, swaps]);

    if (!canReview) return null;

    return (
        <div className="space-y-3 border-t pt-5">
            <div>
                <h4 className="text-sm font-semibold">无需代班待审批请假</h4>
                <p className="text-xs text-muted-foreground">这里只显示没有关联代班请求的待审批请假。</p>
            </div>

            {adminPendingDirectLeaves.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                    当前没有待审批的“无需代班”请假。
                </div>
            ) : (
                <div className="space-y-2">
                    {adminPendingDirectLeaves.map((leave) => (
                        <div key={leave.id} className="rounded-md border px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1 text-sm">
                                    <p className="font-medium flex items-center gap-2">
                                        <UserCircle2 className="h-4 w-4 text-primary" />
                                        {leave.member?.name || '成员'} · {leave.leave_date} · {formatDutySlot(leave.day_of_week, leave.period)}
                                    </p>
                                    <p className="text-muted-foreground">等待管理员直接审批</p>
                                    {leave.reason && (
                                        <p className="text-xs text-muted-foreground">原因：{leave.reason}</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        disabled={isSwapping}
                                        onClick={() => approvePendingLeave(leave.id)}
                                    >
                                        批准
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive"
                                        disabled={isSwapping}
                                        onClick={() => deletePendingLeave(leave.id, {
                                            title: '已驳回请假',
                                            description: '该待审批请假与补班安排已清理。',
                                        })}
                                    >
                                        驳回
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
