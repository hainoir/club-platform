import { useDutyLeaveActions } from '@/hooks/duty/useDutyLeaveActions';
import { useDutyLeaveQueries } from '@/hooks/duty/useDutyLeaveQueries';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseDutyLeavesOptions extends DutyHookContext {
    refreshSwaps: RefreshCallback;
}

/**
 * 【学习注释：请假子域继续拆成“查询 + 动作”】
 * 页面只拿一个统一门面，但底层把读数据和写操作分开，
 * 这样请假展示规则和审批/提交行为就能分别维护。
 */
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
