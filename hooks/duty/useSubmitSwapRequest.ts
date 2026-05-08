import { useCallback } from 'react';

import { getDutyActionErrorMessage } from './action-utils';

import type { Dispatch, SetStateAction } from 'react';
import type { DutyHookContext, RefreshCallback } from './types';

interface UseSubmitSwapRequestOptions extends DutyHookContext {
    refreshSwaps: RefreshCallback;
    setIsSwapping: Dispatch<SetStateAction<boolean>>;
}

export function useSubmitSwapRequest({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshSwaps,
    setIsSwapping,
}: UseSubmitSwapRequestOptions) {
    return useCallback(async (
        originalDay: number,
        originalPeriod: number,
        targetId?: string,
        targetDay?: number,
        targetPeriod?: number
    ) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;
        setIsSwapping(true);
        try {
            const { error } = await supabase
                .from('duty_swaps')
                .insert({
                    requester_id: user.id,
                    original_day: originalDay,
                    original_period: originalPeriod,
                    target_id: targetId || null,
                    target_day: targetDay || null,
                    target_period: targetPeriod || null,
                });

            if (error) throw error;
            toast({ title: '已发布调班请求', description: '请求已送入大厅等地他人响应。' });
            void refreshSwaps();
            return true;
        } catch (error) {
            toast({ title: '发布失败', description: getDutyActionErrorMessage(error), variant: 'destructive' });
            return false;
        } finally {
            setIsSwapping(false);
        }
    }, [ensureActiveSession, refreshSwaps, setIsSwapping, supabase, toast, user]);
}
