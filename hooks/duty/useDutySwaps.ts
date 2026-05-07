import { useCallback, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import {
    DAYS_LABEL,
    type DutyHookContext,
    type RefreshCallback,
    type SwapWithMember,
} from './types';

interface UseDutySwapsOptions extends DutyHookContext {
    refreshRosters: RefreshCallback;
    refreshApprovedLeaves: RefreshCallback;
    refreshPendingLeaves: RefreshCallback;
}

function getErrorMessage(error: unknown): string {
    return (error as { message?: string })?.message || '操作失败，请稍后重试。';
}

export function useDutySwaps({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshRosters,
    refreshApprovedLeaves,
    refreshPendingLeaves,
}: UseDutySwapsOptions) {
    const [swaps, setSwaps] = useState<SwapWithMember[]>([]);
    const [approvedSwaps, setApprovedSwaps] = useState<SwapWithMember[]>([]);
    const [isSwapping, setIsSwapping] = useState(false);

    const refreshSwaps = useCallback(async () => {
        if (!user) {
            setSwaps([]);
            return;
        }

        let query = supabase
            .from('duty_swaps')
            .select('*, requester:members!duty_swaps_requester_id_fkey(id, name), target:members!duty_swaps_target_id_fkey(id, name)')
            .in('status', ['pending', 'accepted']);

        if (!isAdminRole(user.role)) {
            query = query.or(`requester_id.eq.${user.id},target_id.eq.${user.id},and(status.eq.pending,target_id.is.null)`);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .returns<SwapWithMember[]>();

        if (!error && data) {
            setSwaps(data);
        }
    }, [supabase, user]);

    // 【学习注释：已批准代班单独拉取】
    // 值班表上的“代班”标签只关心最终生效的记录，因此和待处理请求分开维护更清晰。
    const refreshApprovedSwaps = useCallback(async () => {
        if (!user) {
            setApprovedSwaps([]);
            return;
        }

        const { data, error } = await supabase
            .from('duty_swaps')
            .select('*, requester:members!duty_swaps_requester_id_fkey(id, name), target:members!duty_swaps_target_id_fkey(id, name)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .returns<SwapWithMember[]>();

        if (!error && data) {
            setApprovedSwaps(data);
        }
    }, [supabase, user]);

    const submitSwapRequest = useCallback(async (
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
            toast({ title: '发布失败', description: getErrorMessage(error), variant: 'destructive' });
            return false;
        } finally {
            setIsSwapping(false);
        }
    }, [ensureActiveSession, refreshSwaps, supabase, toast, user]);

    // 【学习注释：换班请求状态机】
    // 普通成员负责发起和应答，管理员负责最终审批，前端需要把不同身份看到的动作折叠成统一接口。
    const respondToSwap = useCallback(async (swapId: string, accept: boolean) => {
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
            toast({ title: '操作失败', description: getErrorMessage(error), variant: 'destructive' });
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
        supabase,
        swaps,
        toast,
        user,
    ]);

    // 【学习注释：普通成员只能应答，不能直接完成换班】
    const volunteerForSwap = useCallback(async (swapId: string) => {
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
            toast({ title: '应答失败', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    }, [ensureActiveSession, refreshSwaps, supabase, swaps, toast, user]);

    // 【学习注释：管理员驳回时回退状态机】
    const rejectSwap = useCallback(async (swapId: string) => {
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
            toast({ title: '操作失败', description: getErrorMessage(error), variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    }, [ensureActiveSession, refreshSwaps, supabase, toast, user]);

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
