import { useState } from 'react';

import { useRejectSwap } from '@/hooks/duty/useRejectSwap';
import { useRespondToSwap } from '@/hooks/duty/useRespondToSwap';
import { useSubmitSwapRequest } from '@/hooks/duty/useSubmitSwapRequest';
import { useVolunteerForSwap } from '@/hooks/duty/useVolunteerForSwap';

import type { DutyHookContext, RefreshCallback, SwapWithMember } from './types';

interface UseDutySwapActionsOptions extends DutyHookContext {
    swaps: SwapWithMember[];
    refreshSwaps: RefreshCallback;
    refreshApprovedSwaps: RefreshCallback;
    refreshRosters: RefreshCallback;
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
}

/**
 * 【学习注释：代班写操作共享一份加载态】
 * 提交申请、接单、批准和拒绝都属于同一条代班状态机，
 * 用一层装配函数统一注入 `setIsSwapping`，页面反馈会更一致。
 */
export function useDutySwapActions(options: UseDutySwapActionsOptions) {
    const [isSwapping, setIsSwapping] = useState(false);

    const submitSwapRequest = useSubmitSwapRequest({
        ...options,
        setIsSwapping,
    });
    const respondToSwap = useRespondToSwap({
        ...options,
        setIsSwapping,
    });
    const volunteerForSwap = useVolunteerForSwap({
        ...options,
        setIsSwapping,
    });
    const rejectSwap = useRejectSwap({
        ...options,
        setIsSwapping,
    });

    return {
        isSwapping,
        submitSwapRequest,
        respondToSwap,
        volunteerForSwap,
        rejectSwap,
    };
}
