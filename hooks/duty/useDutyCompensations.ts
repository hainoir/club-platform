import { useCallback, useEffect, useRef, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import type { DutySupabaseClient, DutyUser } from './types';

export interface CompensationWithDetails {
    id: string;
    member_id: string;
    compensation_date: string;
    day_of_week: number;
    period: number;
    member: { name: string } | null;
    leave: { status: string } | null;
}

export function useDutyCompensations(supabase: DutySupabaseClient, user: DutyUser) {
    const [result, setResult] = useState<{ scope: string; rows: CompensationWithDetails[] }>({ scope: '', rows: [] });
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const requestId = useRef(0);
    const memberId = user?.id;
    const isAdmin = isAdminRole(user?.role);
    const scope = `${memberId || ''}:${isAdmin}`;

    const refreshCompensations = useCallback(async () => {
        const currentRequest = ++requestId.current;
        if (!memberId) {
            setResult({ scope: '', rows: [] });
            setHasError(false);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        let query = supabase
            .from('duty_compensations')
            .select('id, member_id, compensation_date, day_of_week, period, member:members!duty_compensations_member_id_fkey(name), leave:duty_leaves!duty_compensations_leave_id_fkey(status)');

        // RLS controls visibility; members additionally request only their own plans.
        if (!isAdmin) query = query.eq('member_id', memberId);

        const { data, error } = await query.returns<CompensationWithDetails[]>();
        if (currentRequest !== requestId.current) return;

        setHasError(Boolean(error));
        if (!error) setResult({ scope, rows: data || [] });
        setIsLoading(false);
    }, [isAdmin, memberId, scope, supabase]);

    useEffect(() => {
        void refreshCompensations();
        return () => { requestId.current += 1; };
    }, [refreshCompensations]);

    return {
        compensations: result.scope === scope ? result.rows : [],
        isLoading,
        hasError,
        refreshCompensations,
    };
}
