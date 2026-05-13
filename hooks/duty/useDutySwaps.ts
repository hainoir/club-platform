import { useDutySwapActions } from '@/hooks/duty/useDutySwapActions';
import { useDutySwapQueries } from '@/hooks/duty/useDutySwapQueries';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseDutySwapsOptions extends DutyHookContext {
    refreshRosters: RefreshCallback;
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
}

/**
 * 【学习注释：代班子域负责串联多张业务表的刷新】
 * 代班一旦被接单或批准，会同时影响代班列表、排班结果和请假可见性，
 * 所以这里集中管理依赖关系，避免页面组件自己手动拼刷新顺序。
 */
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
