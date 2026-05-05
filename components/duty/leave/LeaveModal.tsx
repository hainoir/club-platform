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
import { useDuty } from '@/hooks/useDuty';
import { isAdminRole, useUserStore } from '@/store/useUserStore';

interface LeaveModalProps {
    dutyManager: ReturnType<typeof useDuty>;
    allMembers: SimpleMember[];
    mode?: 'member' | 'admin';
}

export function LeaveModal({ dutyManager, allMembers, mode = 'member' }: LeaveModalProps) {
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
                                dutyManager={dutyManager}
                                allMembers={allMembers}
                                currentUserId={user?.id}
                                open={open}
                                onClose={() => setOpen(false)}
                            />
                            <MyPendingLeavesPanel dutyManager={dutyManager} currentUserId={user?.id} />
                        </>
                    )}

                    <LeaveAdminReview dutyManager={dutyManager} canReview={canReview} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
