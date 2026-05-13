import { useCallback, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import type { DutySupabaseClient, DutyUser, SwapWithMember } from './types';

/**
 * 【学习注释：代班查询同时服务“公共大厅”和“个人相关事项”】
 * 管理员可以看到全部 pending/accepted 请求；
 * 普通成员则只看自己发起、自己被定向、或公开大厅里仍无人接单的代班。
 */
export function useDutySwapQueries(supabase: DutySupabaseClient, user: DutyUser) {
    const [swaps, setSwaps] = useState<SwapWithMember[]>([]);
    const [approvedSwaps, setApprovedSwaps] = useState<SwapWithMember[]>([]);

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
            // 【学习注释：普通成员不应看到与自己无关的定向代班】
            // 公开大厅只保留“pending 且 target 为空”的记录。
            query = query.or(`requester_id.eq.${user.id},target_id.eq.${user.id},and(status.eq.pending,target_id.is.null)`);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .returns<SwapWithMember[]>();

        if (!error && data) {
            setSwaps(data);
        }
    }, [supabase, user]);

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

    return {
        swaps,
        approvedSwaps,
        refreshSwaps,
        refreshApprovedSwaps,
    };
}
