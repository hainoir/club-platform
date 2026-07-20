'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarOff } from 'lucide-react';
import { useState } from 'react';

import { LeaveAdminReview } from './LeaveAdminReview';
import { LeaveApplyForm } from './LeaveApplyForm';
import { MyPendingLeavesPanel } from './MyPendingLeavesPanel';
import type { SimpleMember } from '@/components/duty/roster/DutyTable';
import type { LeaveWithMember, RosterWithMember, SwapWithMember } from '@/hooks/useDuty';
import { isAdminRole, useUserStore } from '@/store/useUserStore';

interface LeaveCompensationPayload {
    compensation_date: string;
    day_of_week: number;
    period: number;
}

interface LeaveModalProps {
    rosters: RosterWithMember[];
    approvedLeaves: LeaveWithMember[];
    pendingLeaves: LeaveWithMember[];
    swaps: SwapWithMember[];
    submitLeave: (
        day: number,
        period: number,
        leaveDate: string,
        reason: string,
        penaltyShifts: number,
        compensations: LeaveCompensationPayload[],
        needSubstitute: boolean,
        targetMemberId?: string | null
    ) => Promise<boolean>;
    approvePendingLeave: (leaveId: string) => void | Promise<void>;
    deletePendingLeave: (
        leaveId: string,
        options?: { title?: string; description?: string }
    ) => void | Promise<void>;
    respondToSwap: (swapId: string, accept: boolean) => void | Promise<void>;
    rejectSwap: (swapId: string) => void | Promise<void>;
    isSwapping: boolean;
    allMembers: SimpleMember[];
    mode?: 'member' | 'admin';
}

export function LeaveModal({
    rosters,
    approvedLeaves,
    pendingLeaves,
    swaps,
    submitLeave,
    approvePendingLeave,
    deletePendingLeave,
    respondToSwap,
    rejectSwap,
    isSwapping,
    allMembers,
    mode = 'member',
}: LeaveModalProps) {
    const [open, setOpen] = useState(false);
    const { user } = useUserStore();
    const isAdmin = isAdminRole(user?.role);
    const isAdminMode = mode === 'admin';
    const canReview = isAdminMode && isAdmin;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start text-muted-foreground"
                    disabled={isAdminMode && !isAdmin}
                >
                    <CalendarOff className="w-4 h-4 mr-2" />
                    {isAdminMode ? '请假审批' : '我要请假...'}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px]">
                <DialogHeader>
                    <DialogTitle>{isAdminMode ? '请假审批' : '请假申请'}</DialogTitle>
                    <DialogDescription>
                        {isAdminMode
                            ? '这里只处理无需代班、等待管理员直接审批的请假请求。'
                            : '提交后先进入待审批状态。只有管理员批准后，请假才会正式生效。'}
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 max-h-[70vh] space-y-6 overflow-y-auto pr-1">
                    {!isAdminMode && (
                        <>
                            <LeaveApplyForm
                                rosters={rosters}
                                approvedLeaves={approvedLeaves}
                                pendingLeaves={pendingLeaves}
                                submitLeave={submitLeave}
                                allMembers={allMembers}
                                currentUserId={user?.id}
                                open={open}
                                onClose={() => setOpen(false)}
                            />
                            <MyPendingLeavesPanel
                                pendingLeaves={pendingLeaves}
                                swaps={swaps}
                                respondToSwap={respondToSwap}
                                rejectSwap={rejectSwap}
                                deletePendingLeave={deletePendingLeave}
                                isSwapping={isSwapping}
                                currentUserId={user?.id}
                            />
                        </>
                    )}

                    <LeaveAdminReview
                        pendingLeaves={pendingLeaves}
                        swaps={swaps}
                        approvePendingLeave={approvePendingLeave}
                        deletePendingLeave={deletePendingLeave}
                        isSwapping={isSwapping}
                        canReview={canReview}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
