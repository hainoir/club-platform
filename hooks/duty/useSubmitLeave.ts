import { useCallback } from 'react';

import { getDutyActionErrorMessage } from './action-utils';
import { isDutyLeaveDateSelectable } from '@/lib/duty/duty-time';

import {
    DAYS_LABEL,
    type DutyHookContext,
    type LeaveWithMember,
    type RefreshCallback,
} from './types';

export interface LeaveCompensationInput {
    compensation_date: string;
    day_of_week: number;
    period: number;
}

type CreatedLeaveId = Pick<LeaveWithMember, 'id'>;

interface UseSubmitLeaveOptions extends DutyHookContext {
    refreshPendingLeaves: RefreshCallback;
    refreshSwaps: RefreshCallback;
}

export function useSubmitLeave({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshPendingLeaves,
    refreshSwaps,
}: UseSubmitLeaveOptions) {
    return useCallback(async (
        day: number,
        period: number,
        leaveDate: string,
        reason: string,
        penaltyShifts: number,
        compensations: LeaveCompensationInput[],
        needSubstitute: boolean,
        targetMemberId?: string | null
    ) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;
        if (!isDutyLeaveDateSelectable(leaveDate, day, period)) {
            toast({
                title: '请假日期无效',
                description: '请选择与值班星期一致、尚未结束且不是节假日的班次日期。',
                variant: 'destructive',
            });
            return false;
        }

        let leaveId: string | null = null;

        try {
            const { data: leaveData, error: leaveError } = await supabase
                .from('duty_leaves')
                .insert({
                    member_id: user.id,
                    day_of_week: day,
                    period,
                    leave_date: leaveDate,
                    reason: reason || null,
                    penalty_shifts: penaltyShifts,
                    status: 'pending',
                })
                .select('id')
                .returns<CreatedLeaveId[]>()
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
                        ? `${leaveDate}（周${DAYS_LABEL[day - 1]}第${period}大节）已提交待审批请假，并定向邀请代班成员。`
                        : `${leaveDate}（周${DAYS_LABEL[day - 1]}第${period}大节）已提交待审批请假，并发布到公共代班大厅。`
                    : `${leaveDate}（周${DAYS_LABEL[day - 1]}第${period}大节）已提交待审批请假，等待管理员审批。`,
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
            toast({ title: '请假失败', description: getDutyActionErrorMessage(error), variant: 'destructive' });
            return false;
        }
    }, [ensureActiveSession, refreshPendingLeaves, refreshSwaps, supabase, toast, user]);
}
