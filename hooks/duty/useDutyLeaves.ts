import { useDutyLeaveActions } from '@/hooks/duty/useDutyLeaveActions';
import { useDutyLeaveQueries } from '@/hooks/duty/useDutyLeaveQueries';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseDutyLeavesOptions extends DutyHookContext {
    refreshSwaps: RefreshCallback;
}

export function useDutyLeaves({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshSwaps,
}: UseDutyLeavesOptions) {
    const {
        approvedLeaves,
        pendingLeaves,
        refreshApprovedLeaves,
        refreshPendingLeaves,
    } = useDutyLeaveQueries(supabase, user);

    const {
        submitLeave,
        approvePendingLeave,
        deletePendingLeave,
    } = useDutyLeaveActions({
        supabase,
        user,
        toast,
        ensureActiveSession,
        refreshApprovedLeaves,
        refreshPendingLeaves,
        refreshSwaps,
    });

    return {
        approvedLeaves,
        pendingLeaves,
        refreshApprovedLeaves,
        refreshPendingLeaves,
        submitLeave,
        approvePendingLeave,
        deletePendingLeave,
    };
}
