import { useCallback } from 'react';

import { getDutyActionErrorMessage } from './action-utils';

import type { Dispatch, SetStateAction } from 'react';
import type { DutyHookContext, RefreshCallback } from './types';

interface UseRejectSwapOptions extends DutyHookContext {
    refreshSwaps: RefreshCallback;
    setIsSwapping: Dispatch<SetStateAction<boolean>>;
}

export function useRejectSwap({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshSwaps,
    setIsSwapping,
}: UseRejectSwapOptions) {
    return useCallback(async (swapId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            const { error } = await supabase.rpc('return_duty_swap_to_hall', {
                p_swap_id: swapId,
            });

            if (error) throw error;
            toast({ title: '已退回大厅', description: '该代班请求已转为公共待应答状态。' });
            void refreshSwaps();
        } catch (error) {
            toast({ title: '操作失败', description: getDutyActionErrorMessage(error), variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    }, [ensureActiveSession, refreshSwaps, setIsSwapping, supabase, toast, user]);
}
