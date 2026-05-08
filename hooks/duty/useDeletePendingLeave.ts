import { useCallback } from 'react';

import { getDutyActionErrorMessage } from './action-utils';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseDeletePendingLeaveOptions extends DutyHookContext {
    refreshPendingLeaves: RefreshCallback;
    refreshSwaps: RefreshCallback;
}

export function useDeletePendingLeave({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshPendingLeaves,
    refreshSwaps,
}: UseDeletePendingLeaveOptions) {
    return useCallback(async (
        leaveId: string,
        options?: { title?: string; description?: string }
    ) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase
                .from('duty_leaves')
                .delete()
                .eq('id', leaveId)
                .eq('status', 'pending');

            if (error) throw error;

            toast({
                title: options?.title || '已撤回请假',
                description: options?.description || '待生效的请假与补班安排已清理。',
            });
            void refreshPendingLeaves();
            void refreshSwaps();
        } catch (error) {
            toast({ title: '操作失败', description: getDutyActionErrorMessage(error), variant: 'destructive' });
        }
    }, [ensureActiveSession, refreshPendingLeaves, refreshSwaps, supabase, toast, user]);
}
