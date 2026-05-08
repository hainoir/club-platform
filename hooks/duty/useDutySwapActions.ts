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
