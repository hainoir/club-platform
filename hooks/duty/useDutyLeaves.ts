import { useCallback, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import {
    DAYS_LABEL,
    type DutyHookContext,
    type LeaveWithMember,
    type RefreshCallback,
} from './types';

interface UseDutyLeavesOptions extends DutyHookContext {
    refreshSwaps: RefreshCallback;
}

interface LeaveCompensationInput {
    compensation_date: string;
    day_of_week: number;
    period: number;
}

function getErrorMessage(error: unknown): string {
    return (error as { message?: string })?.message || '操作失败，请稍后重试。';
}

export function useDutyLeaves({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshSwaps,
}: UseDutyLeavesOptions) {
    const [approvedLeaves, setApprovedLeaves] = useState<LeaveWithMember[]>([]);
    const [pendingLeaves, setPendingLeaves] = useState<LeaveWithMember[]>([]);

    // 【学习注释：请假读模型拆分】
    // approvedLeaves 只服务“已经生效的请假”，pendingLeaves 只服务审批/撤销界面。
    const refreshApprovedLeaves = useCallback(async () => {
        if (!user) {
            setApprovedLeaves([]);
            return;
        }

        const { data, error } = await supabase
            .from('duty_leaves')
            .select('*, member:members!duty_leaves_member_id_fkey(id, name)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setApprovedLeaves(data as unknown as LeaveWithMember[]);
        }
    }, [supabase, user]);

    const refreshPendingLeaves = useCallback(async () => {
        if (!user) {
            setPendingLeaves([]);
            return;
        }

        let query = supabase
            .from('duty_leaves')
            .select('*, member:members!duty_leaves_member_id_fkey(id, name)')
            .eq('status', 'pending');

        if (!isAdminRole(user.role)) {
            query = query.eq('member_id', user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (!error && data) {
            setPendingLeaves(data as unknown as LeaveWithMember[]);
        }
    }, [supabase, user]);

    // 【学习注释：请假提交流程】
    // 提交动作只会先创建“待审批”的 leave；是否需要代班决定是否额外创建一条关联 swap。
    const submitLeave = useCallback(async (
        day: number,
        period: number,
        reason: string,
        penaltyShifts: number,
        compensations: LeaveCompensationInput[],
        needSubstitute: boolean,
        targetMemberId?: string | null
    ) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;

        let leaveId: string | null = null;

        try {
            const { data: leaveData, error: leaveError } = await supabase
                .from('duty_leaves')
                .insert({
                    member_id: user.id,
                    day_of_week: day,
                    period,
                    reason: reason || null,
                    penalty_shifts: penaltyShifts,
                    status: 'pending',
                })
                .select('id')
                .single();

            if (leaveError || !leaveData) throw leaveError || new Error('Leave request was not created');
            const createdLeaveId = leaveData.id;
            leaveId = createdLeaveId;

            if (compensations.length > 0) {
                const compRecords = compensations.map((c) => ({
                    leave_id: createdLeaveId,
                    member_id: user.id,
                    compensation_date: c.compensation_date,
                    day_of_week: c.day_of_week,
                    period: c.period,
                }));

                const { error: compError } = await supabase
                    .from('duty_compensations')
                    .insert(compRecords);

                if (compError) throw compError;
            }

            if (needSubstitute) {
                const { error: swapError } = await supabase
                    .from('duty_swaps')
                    .insert({
                        requester_id: user.id,
                        leave_id: createdLeaveId,
                        original_day: day,
                        original_period: period,
                        target_id: targetMemberId || null,
                    });

                if (swapError) throw swapError;
            }

            toast({
                title: '请假申请已提交',
                description: needSubstitute
                    ? targetMemberId
                        ? `周${DAYS_LABEL[day - 1]}第${period}大节，已提交待审批请假，并定向邀请代班成员。`
                        : `周${DAYS_LABEL[day - 1]}第${period}大节，已提交待审批请假，并发布到公共代班大厅。`
                    : `周${DAYS_LABEL[day - 1]}第${period}大节，已提交待审批请假，等待管理员审批。`,
            });

            void refreshPendingLeaves();
            if (needSubstitute) {
                void refreshSwaps();
            }
            return true;
        } catch (error) {
            if (leaveId) {
                await supabase.from('duty_leaves').delete().eq('id', leaveId).eq('status', 'pending');
            }
            toast({ title: '请假失败', description: getErrorMessage(error), variant: 'destructive' });
            return false;
        }
    }, [ensureActiveSession, refreshPendingLeaves, refreshSwaps, supabase, toast, user]);

    const approvePendingLeave = useCallback(async (leaveId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase.rpc('approve_duty_leave', {
                p_leave_id: leaveId,
            });

            if (error) throw error;

            toast({ title: '已批准请假', description: '该请假现在正式生效。' });
            void refreshApprovedLeaves();
            void refreshPendingLeaves();
        } catch (error) {
            toast({ title: '审批失败', description: getErrorMessage(error), variant: 'destructive' });
        }
    }, [ensureActiveSession, refreshApprovedLeaves, refreshPendingLeaves, supabase, toast, user]);

    const deletePendingLeave = useCallback(async (
        leaveId: string,
        options?: { title?: string; description?: string }
    ) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase
                .from('duty_leaves')
                .delete()
                .eq('id', leaveId)
                .eq('status', 'pending');

            if (error) throw error;

            toast({
                title: options?.title || '已撤回请假',
                description: options?.description || '待生效的请假与补班安排已清理。',
            });
            void refreshPendingLeaves();
            void refreshSwaps();
        } catch (error) {
            toast({ title: '操作失败', description: getErrorMessage(error), variant: 'destructive' });
        }
    }, [ensureActiveSession, refreshPendingLeaves, refreshSwaps, supabase, toast, user]);

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
