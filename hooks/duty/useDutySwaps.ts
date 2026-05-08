import { useDutySwapActions } from '@/hooks/duty/useDutySwapActions';
import { useDutySwapQueries } from '@/hooks/duty/useDutySwapQueries';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseDutySwapsOptions extends DutyHookContext {
    refreshRosters: RefreshCallback;
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
}

export function useDutySwaps({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshRosters,
    refreshApprovedLeaves,
    refreshPendingLeaves,
}: UseDutySwapsOptions) {
    const {
        swaps,
        approvedSwaps,
        refreshSwaps,
        refreshApprovedSwaps,
    } = useDutySwapQueries(supabase, user);

    const {
        isSwapping,
        submitSwapRequest,
        respondToSwap,
        volunteerForSwap,
        rejectSwap,
    } = useDutySwapActions({
        supabase,
        user,
        toast,
        ensureActiveSession,
        swaps,
        refreshSwaps,
        refreshApprovedSwaps,
        refreshRosters,
        refreshApprovedLeaves,
        refreshPendingLeaves,
    });

    return {
        swaps,
        approvedSwaps,
        isSwapping,
        refreshSwaps,
        refreshApprovedSwaps,
        submitSwapRequest,
        respondToSwap,
        volunteerForSwap,
        rejectSwap,
    };
}
