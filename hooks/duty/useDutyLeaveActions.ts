import { useApprovePendingLeave } from '@/hooks/duty/useApprovePendingLeave';
import { useDeletePendingLeave } from '@/hooks/duty/useDeletePendingLeave';
import { useSubmitLeave } from '@/hooks/duty/useSubmitLeave';

import type { DutyHookContext, RefreshCallback } from './types';

interface UseDutyLeaveActionsOptions extends DutyHookContext {
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
    refreshSwaps: RefreshCallback;
}

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
