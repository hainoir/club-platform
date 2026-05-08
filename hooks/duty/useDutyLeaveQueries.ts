import { useCallback, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import type { DutySupabaseClient, DutyUser, LeaveWithMember } from './types';

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
