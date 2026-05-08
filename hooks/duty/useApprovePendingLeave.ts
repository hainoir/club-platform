import { useCallback } from 'react';

import { getDutyActionErrorMessage } from './action-utils';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseApprovePendingLeaveOptions extends DutyHookContext {
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
}

export function useApprovePendingLeave({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshApprovedLeaves,
    refreshPendingLeaves,
}: UseApprovePendingLeaveOptions) {
    return useCallback(async (leaveId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase.rpc('approve_duty_leave', {
                p_leave_id: leaveId,
            });

            if (error) throw error;

            toast({ title: '已批准请假', description: '该请假现在正式生效。' });
            void refreshApprovedLeaves();
            void refreshPendingLeaves();
        } catch (error) {
            toast({ title: '审批失败', description: getDutyActionErrorMessage(error), variant: 'destructive' });
        }
    }, [ensureActiveSession, refreshApprovedLeaves, refreshPendingLeaves, supabase, toast, user]);
}
