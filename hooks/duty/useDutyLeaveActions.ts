import { useApprovePendingLeave } from '@/hooks/duty/useApprovePendingLeave';
import { useDeletePendingLeave } from '@/hooks/duty/useDeletePendingLeave';
import { useSubmitLeave } from '@/hooks/duty/useSubmitLeave';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseDutyLeaveActionsOptions extends DutyHookContext {
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
    refreshSwaps: RefreshCallback;
}

/**
 * 【学习注释：请假写操作的装配层】
 * 这里不直接写业务逻辑，而是把提交、审批、删除三个动作装成统一入口，
 * 保持 `useDutyLeaves` 对外接口稳定。
 */
export function useDutyLeaveActions(options: UseDutyLeaveActionsOptions) {
    const submitLeave = useSubmitLeave(options);
    const approvePendingLeave = useApprovePendingLeave(options);
    const deletePendingLeave = useDeletePendingLeave(options);

    return {
        submitLeave,
        approvePendingLeave,
        deletePendingLeave,
    };
}
