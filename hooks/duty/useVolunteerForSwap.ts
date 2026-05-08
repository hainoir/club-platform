import { useCallback } from 'react';

import { getDutyActionErrorMessage } from './action-utils';

import type { Dispatch, SetStateAction } from 'react';
import type { DutyHookContext, RefreshCallback, SwapWithMember } from './types';

interface UseVolunteerForSwapOptions extends DutyHookContext {
    swaps: SwapWithMember[];
    refreshSwaps: RefreshCallback;
    setIsSwapping: Dispatch<SetStateAction<boolean>>;
}

export function useVolunteerForSwap({
    supabase,
    user,
    toast,
    ensureActiveSession,
    swaps,
    refreshSwaps,
    setIsSwapping,
}: UseVolunteerForSwapOptions) {
    return useCallback(async (swapId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            const { error } = await supabase.rpc('volunteer_for_duty_swap', {
                p_swap_id: swapId,
            });

            if (error) throw error;

            const swapRecord = swaps.find((s) => s.id === swapId);
            toast({
                title: '已应答代班',
                description: swapRecord?.target_id === user.id
                    ? '您已接受定向代班邀请，等待管理员审批。'
                    : `您已应答 ${swapRecord?.requester.name || ''} 的代班请求，等待管理员审批。`,
            });
            void refreshSwaps();
        } catch (error) {
            toast({ title: '应答失败', description: getDutyActionErrorMessage(error), variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    }, [ensureActiveSession, refreshSwaps, setIsSwapping, supabase, swaps, toast, user]);
}
