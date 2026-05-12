import { useCallback, useState, useTransition } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import {
    type DutyHookContext,
    type RosterWithMember,
} from './types';

function getDutyWriteErrorMessage(error: unknown, fallback: string): string {
    const typedError = error as { code?: string; message?: string };
    if (typedError?.code === '42501') {
        return '数据库权限拒绝：请确认已应用最新 duty/key RLS 策略，并检查当前账号角色。';
    }
    return typedError?.message || fallback;
}

export function useDutyRosters(
    initialRosters: RosterWithMember[],
    { supabase, user, toast, ensureActiveSession }: DutyHookContext
) {
    const [rosters, setRosters] = useState<RosterWithMember[]>(initialRosters);
    const [isPending, startTransition] = useTransition();

    // 【学习注释：基础数据刷新】
    // 刷新函数负责把数据库里的真实状态重新拉回前端，是乐观更新最终收口的依据。
    const refreshRosters = useCallback(async () => {
        const { data, error } = await supabase
            .from('duty_rosters')
            .select('*, member:members(id, name, student_id)')
            .returns<RosterWithMember[]>();

        if (!error && data) {
            setRosters(data);
        }
    }, [supabase]);

    // 【学习注释：排班操作与乐观更新】
    // 管理员点击后先更新本地界面，再回写数据库；失败时再刷新真实数据回滚。
    const toggleDutySlot = useCallback(async (day: number, period: number, memberId: string, memberName: string) => {
        if (!user) {
            toast({ title: '尚未登录', description: '请先登录后再进行排班操作。', variant: 'destructive' });
            return;
        }

        if (!isAdminRole(user.role)) {
            toast({ title: '权限不足', description: '仅管理员可以进行排班操作。', variant: 'destructive' });
            return;
        }

        if (!(await ensureActiveSession())) {
            return;
        }

        const existingSlot = rosters.find((r) => r.day_of_week === day && r.period === period && r.member_id === memberId);
        const isAdding = !existingSlot;

        startTransition(() => {
            if (isAdding) {
                const optimisticRoster: RosterWithMember = {
                    id: `temp-${Date.now()}`,
                    member_id: memberId,
                    day_of_week: day,
                    period,
                    has_key: false,
                    created_at: new Date().toISOString(),
                    member: {
                        id: memberId,
                        name: memberName,
                        student_id: null,
                    },
                };
                setRosters((prev) => [...prev, optimisticRoster]);
            } else {
                setRosters((prev) => prev.filter((r) => r.id !== existingSlot.id));
            }
        });

        try {
            if (isAdding) {
                const { error } = await supabase
                    .from('duty_rosters')
                    .insert({
                        member_id: memberId,
                        day_of_week: day,
                        period,
                    });
                if (error) throw error;
                toast({ title: '指派成功', description: `已将 ${memberName} 安排到周${day}第${period}大节值班。` });
            } else {
                const { error } = await supabase
                    .from('duty_rosters')
                    .delete()
                    .eq('member_id', memberId)
                    .eq('day_of_week', day)
                    .eq('period', period);
                if (error) throw error;
                toast({ title: '已移除排班', description: `已将 ${memberName} 从该时段移除。` });
            }
            void refreshRosters();
        } catch (error) {
            await refreshRosters();
            toast({
                title: '操作失败',
                description: getDutyWriteErrorMessage(error, '更新值班状态出错，请稍后重试'),
                variant: 'destructive',
            });
        }
    }, [ensureActiveSession, refreshRosters, rosters, supabase, toast, user]);

    // 【学习注释：钥匙权限同样前置到前端】
    // 钥匙是跨多个值班槽位共享的状态，因此这里按成员批量更新相关排班记录。
    const toggleKey = useCallback(async (memberId: string, hasKey: boolean) => {
        if (!user) {
            toast({ title: '尚未登录', description: '请先登录后再进行钥匙操作。', variant: 'destructive' });
            return;
        }

        if (!isAdminRole(user.role)) {
            toast({ title: '权限不足', description: '仅管理员可以修改钥匙持有状态。', variant: 'destructive' });
            return;
        }

        if (!(await ensureActiveSession())) return;

        try {
            const { error } = await supabase
                .from('duty_rosters')
                .update({ has_key: hasKey })
                .eq('member_id', memberId);

            if (error) throw error;
            toast({ title: hasKey ? '已标记持有钥匙' : '已取消钥匙标记' });
            void refreshRosters();
        } catch (error) {
            toast({
                title: '操作失败',
                description: getDutyWriteErrorMessage(error, '更新钥匙状态失败，请稍后重试。'),
                variant: 'destructive',
            });
        }
    }, [ensureActiveSession, refreshRosters, supabase, toast, user]);

    return {
        rosters,
        isPending,
        refreshRosters,
        toggleDutySlot,
        toggleKey,
    };
}
