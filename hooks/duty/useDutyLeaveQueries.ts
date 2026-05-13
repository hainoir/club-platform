import { useCallback, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import type { DutySupabaseClient, DutyUser, LeaveWithMember } from './types';

/**
 * 【学习注释：请假读取规则直接贴着权限模型实现】
 * 已批准请假对所有人可见；待审批请假则按“管理员看全部，成员看自己”来收口。
 * 这样 UI 展示和数据库契约不会出现两套不同的可见性理解。
 */
export function useDutyLeaveQueries(supabase: DutySupabaseClient, user: DutyUser) {
    const [approvedLeaves, setApprovedLeaves] = useState<LeaveWithMember[]>([]);
    const [pendingLeaves, setPendingLeaves] = useState<LeaveWithMember[]>([]);

    const refreshApprovedLeaves = useCallback(async () => {
        if (!user) {
            setApprovedLeaves([]);
            return;
        }

        const { data, error } = await supabase
            .from('duty_leaves')
            .select('*, member:members!duty_leaves_member_id_fkey(id, name)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .returns<LeaveWithMember[]>();

        if (!error && data) {
            setApprovedLeaves(data);
        }
    }, [supabase, user]);

    const refreshPendingLeaves = useCallback(async () => {
        if (!user) {
            setPendingLeaves([]);
            return;
        }

        // 【学习注释：待审批请假视图带角色分叉】
        // 管理员要看完整审批池，普通成员只应看到自己的待处理记录。
        let query = supabase
            .from('duty_leaves')
            .select('*, member:members!duty_leaves_member_id_fkey(id, name)')
            .eq('status', 'pending');

        if (!isAdminRole(user.role)) {
            query = query.eq('member_id', user.id);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .returns<LeaveWithMember[]>();

        if (!error && data) {
            setPendingLeaves(data);
        }
    }, [supabase, user]);

    return {
        approvedLeaves,
        pendingLeaves,
        refreshApprovedLeaves,
        refreshPendingLeaves,
    };
}
