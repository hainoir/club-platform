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
        const pageSize = 1000;
        const rows: CompensationWithDetails[] = [];
        let offset = 0;
        let failed = false;

        while (true) {
            let query = supabase
                .from('duty_compensations')
                .select('id, member_id, compensation_date, day_of_week, period, member:members!duty_compensations_member_id_fkey(name), leave:duty_leaves!duty_compensations_leave_id_fkey(status)')
                .order('compensation_date', { ascending: true })
                .order('id', { ascending: true })
                .range(offset, offset + pageSize - 1);

            // RLS controls visibility; members additionally request only their own plans.
            if (!isAdmin) query = query.eq('member_id', memberId);

            const { data, error } = await query.returns<CompensationWithDetails[]>();
            if (currentRequest !== requestId.current) return;
            if (error) {
                failed = true;
                break;
            }
            const page = data || [];
            rows.push(...page);
            if (page.length < pageSize) break;
            offset += pageSize;
            if (offset >= pageSize * 20) break;
        }

        setHasError(failed);
        if (!failed) setResult({ scope, rows });
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
