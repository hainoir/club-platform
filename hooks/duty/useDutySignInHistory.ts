import { useEffect, useState } from 'react';

import type { SupabaseBrowserClient } from '@/hooks/shared/useSupabase';
import type { AppUser } from '@/lib/app-user';
import { addDaysToDateKey, getDutyNow, getDutyWeekMondayDateKey } from '@/lib/duty/duty-time';
import { isAdminRole } from '@/store/useUserStore';
import type { Database } from '@/types/supabase';

type DutyLog = Pick<
    Database['public']['Tables']['duty_logs']['Row'],
    'id' | 'member_id' | 'sign_in_date' | 'sign_in_time' | 'location_verified'
>;

export type DutySignInHistoryRow = DutyLog & {
    member: { id: string; name: string } | null;
};

export function useDutySignInHistory(supabase: SupabaseBrowserClient, user: AppUser | null) {
    const [rows, setRows] = useState<DutySignInHistoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const memberId = user?.id;
    const isAdmin = isAdminRole(user?.role);

    useEffect(() => {
        let cancelled = false;

        if (!memberId) {
            setRows([]);
            setError('请登录后查看签到记录。');
            setLoading(false);
            return;
        }

        setRows([]);
        setError(null);
        setLoading(true);

        async function load() {
            try {
                const today = getDutyNow().dateKey;
                const firstMonday = addDaysToDateKey(getDutyWeekMondayDateKey(new Date()), -7 * 7);
                let query = supabase
                    .from('duty_logs')
                    .select('id, member_id, sign_in_date, sign_in_time, location_verified, member:members!duty_logs_member_id_fkey(id, name)')
                    .gte('sign_in_date', firstMonday)
                    .lte('sign_in_date', today);

                if (!isAdmin) {
                    query = query.eq('member_id', memberId!);
                }

                const { data, error: queryError } = await query
                    .order('sign_in_time', { ascending: false })
                    .limit(50)
                    .returns<DutySignInHistoryRow[]>();

                if (queryError) throw queryError;
                if (!cancelled) setRows(data ?? []);
            } catch {
                if (!cancelled) {
                    setRows([]);
                    setError('无法读取签到记录，请稍后重试。');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => { cancelled = true; };
    }, [supabase, memberId, isAdmin]);

    return { rows, loading, error };
}
