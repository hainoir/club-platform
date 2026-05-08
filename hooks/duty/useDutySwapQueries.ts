import { useCallback, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import type { DutySupabaseClient, DutyUser, SwapWithMember } from './types';

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
