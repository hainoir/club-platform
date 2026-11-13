import { useEffect, useState } from 'react';

import { isAdminRole } from '@/store/useUserStore';

import type { DutySupabaseClient, DutyUser, LeaveWithMember } from './types';

const HISTORY_LIMIT = 100;

interface HistoryState {
    scope: string | null;
    rows: LeaveWithMember[];
    loading: boolean;
    error: string | null;
}

export function useDutyLeaveHistory(supabase: DutySupabaseClient, user: DutyUser, refreshKey = '') {
    const scope = user ? `${user.id}:${isAdminRole(user.role)}` : null;
    const [state, setState] = useState<HistoryState>({
        scope: null,
        rows: [],
        loading: false,
        error: null,
    });

    useEffect(() => {
        if (!user || !scope) {
            setState({ scope: null, rows: [], loading: false, error: null });
            return;
        }

        const currentUser = user;
        let active = true;
        setState({ scope, rows: [], loading: true, error: null });

        async function load() {
            // RLS supplies the admin's full visible set. Members only request their own rows.
            let query = supabase
                .from('duty_leaves')
                .select('id, member_id, leave_date, day_of_week, period, status, reason, penalty_shifts, expires_at, created_at, member:members!duty_leaves_member_id_fkey(id, name)');

            if (!isAdminRole(currentUser.role)) {
                query = query.eq('member_id', currentUser.id);
            }

            const { data, error } = await query
                .order('expires_at', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(HISTORY_LIMIT)
                .returns<LeaveWithMember[]>();

            if (!active) return;
            setState({
                scope,
                rows: error ? [] : (data ?? []),
                loading: false,
                error: error ? '请假记录加载失败，请稍后重试。' : null,
            });
        }

        void load();
        return () => { active = false; };
    }, [supabase, scope, user, refreshKey]);

    // Never show a previous account's rows while the new account's query is pending.
    return state.scope === scope
        ? state
        : { scope, rows: [], loading: Boolean(scope), error: null };
}
