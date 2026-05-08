import { useCallback } from 'react';

import { isAdminRole } from '@/store/useUserStore';
import { getDutyActionErrorMessage } from './action-utils';

import type { Dispatch, SetStateAction } from 'react';
import type { DutyHookContext, RefreshCallback, SwapWithMember } from './types';
import { DAYS_LABEL } from './types';

interface UseRespondToSwapOptions extends DutyHookContext {
    swaps: SwapWithMember[];
    refreshSwaps: RefreshCallback;
    refreshApprovedSwaps: RefreshCallback;
    refreshRosters: RefreshCallback;
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
    setIsSwapping: Dispatch<SetStateAction<boolean>>;
}

export function useRespondToSwap({
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
    setIsSwapping,
}: UseRespondToSwapOptions) {
    return useCallback(async (swapId: string, accept: boolean) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            const swapRecord = swaps.find((s) => s.id === swapId);

            if (!accept) {
                const deleteQuery = swapRecord?.leave_id
                    ? supabase.from('duty_leaves').delete().eq('id', swapRecord.leave_id).eq('status', 'pending')
                    : supabase.from('duty_swaps').delete().eq('id', swapId);

                const { error } = await deleteQuery;
                if (error) throw error;
                toast({ title: '已撤回请求', description: '关联的待生效请假与补班安排已清理。' });
            } else {
                if (!isAdminRole(user.role)) {
                    toast({ title: '权限不足', description: '仅管理员可以审批代班请求。', variant: 'destructive' });
                    return;
                }

                if (!swapRecord) {
                    toast({ title: '请求不存在', description: '该换班请求可能已被撤销。', variant: 'destructive' });
                    return;
                }

                const { error: rpcError } = await supabase.rpc('accept_duty_swap', {
                    p_swap_id: swapId,
                    p_acceptor_id: swapRecord.target?.id || '',
                });

                if (rpcError) throw rpcError;

                toast({
                    title: '已批准代班',
                    description: `${swapRecord.target?.name} 将接替 ${swapRecord.requester.name} 周${DAYS_LABEL[swapRecord.original_day - 1]}第${swapRecord.original_period}大节的值班。`,
                });

                void refreshRosters();
                void refreshApprovedSwaps();
                void refreshApprovedLeaves();
            }

            void refreshSwaps();
            void refreshPendingLeaves();
        } catch (error) {
            toast({ title: '操作失败', description: getDutyActionErrorMessage(error), variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    }, [
        ensureActiveSession,
        refreshApprovedLeaves,
        refreshApprovedSwaps,
        refreshPendingLeaves,
        refreshRosters,
        refreshSwaps,
        setIsSwapping,
        supabase,
        swaps,
        toast,
        user,
    ]);
}
