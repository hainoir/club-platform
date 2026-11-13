import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast-simple';
import { useProtectedAction } from '@/hooks/shared/useProtectedAction';
import { useSupabase } from '@/hooks/shared/useSupabase';
import { extractErrorMessage } from '@/lib/shared/client-request';
import { isAdminRole, useUserStore } from '@/store/useUserStore';
import type { Database } from '@/types/supabase';

export type AdminDutyLog = Pick<Database['public']['Tables']['duty_logs']['Row'], 'id' | 'member_id' | 'sign_in_time' | 'location_verified'>;
export type SignInAdminEvent = Pick<Database['public']['Tables']['duty_sign_in_admin_events']['Row'], 'id' | 'action' | 'created_at' | 'reason' | 'target_member_id' | 'sign_in_time'>;

export function useDutySignInAdmin(onChanged: () => void) {
    const supabase = useSupabase();
    const { user } = useUserStore();
    const { toast } = useToast();
    const { requireAuth } = useProtectedAction();
    const [logs, setLogs] = useState<AdminDutyLog[]>([]);
    const [logLimit, setLogLimit] = useState(30);
    const [hasMoreLogs, setHasMoreLogs] = useState(false);
    const [events, setEvents] = useState<SignInAdminEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const busyRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!isAdminRole(user?.role)) return;
        setLoading(true);
        try {
            if (!(await requireAuth('请重新登录后查看值班签到记录。'))) return;
            const [logsResult, eventsResult] = await Promise.all([
                supabase.from('duty_logs')
                    .select('id, member_id, sign_in_time, location_verified')
                    .order('sign_in_time', { ascending: false })
                    .order('id', { ascending: false }).range(0, logLimit - 1),
                supabase.from('duty_sign_in_admin_events')
                    .select('id, action, created_at, reason, target_member_id, sign_in_time')
                    .order('created_at', { ascending: false }).limit(10),
            ]);
            if (logsResult.error) throw logsResult.error;
            if (eventsResult.error) throw eventsResult.error;
            setLogs(logsResult.data ?? []);
            setHasMoreLogs((logsResult.data?.length ?? 0) === logLimit);
            setEvents(eventsResult.data ?? []);
            setErrorMessage(null);
        } catch (error) {
            setErrorMessage(extractErrorMessage(error, '无法读取签到管理记录'));
        } finally {
            setLoading(false);
        }
    }, [logLimit, requireAuth, supabase, user?.role]);

    useEffect(() => { void load(); }, [load]);

    const run = useCallback(async (
        action: 'backfill' | 'invalid' | 'delete',
        args: { memberId?: string; signInTime?: string; logId?: string; reason: string },
    ): Promise<boolean> => {
        if (!isAdminRole(user?.role) || busyRef.current) return false;
        const reason = args.reason.trim();
        if (reason.length < 1 || reason.length > 200) {
            setErrorMessage('原因需为 1 到 200 字。');
            return false;
        }
        busyRef.current = true;
        setSaving(true);
        setErrorMessage(null);
        try {
            if (!(await requireAuth('请重新登录后处理值班签到。'))) return false;
            if (action === 'backfill') {
                if (!args.memberId || !args.signInTime) throw new Error('请选择成员和补签时间。');
                const { error } = await supabase.rpc('admin_backfill_duty_sign_in', {
                    p_member_id: args.memberId,
                    p_sign_in_time: args.signInTime,
                    p_reason: reason,
                });
                if (error) throw error;
            } else {
                if (!args.logId) throw new Error('请选择签到记录。');
                const { error } = action === 'invalid'
                    ? await supabase.rpc('mark_duty_sign_in_invalid', { p_log_id: args.logId, p_reason: reason })
                    : await supabase.rpc('delete_duty_sign_in', { p_log_id: args.logId, p_reason: reason });
                if (error) throw error;
            }
            toast({ title: action === 'backfill' ? '补签成功' : action === 'invalid' ? '签到已作废' : '签到已删除' });
            await load();
            onChanged();
            return true;
        } catch (error) {
            const message = extractErrorMessage(error, '签到管理操作失败');
            setErrorMessage(message);
            toast({ title: '签到管理操作失败', description: message, variant: 'destructive' });
            return false;
        } finally {
            busyRef.current = false;
            setSaving(false);
        }
    }, [load, onChanged, requireAuth, supabase, toast, user?.role]);

    return { logs, hasMoreLogs, loadMoreLogs: () => setLogLimit((value) => value + 30), events, loading, saving, errorMessage, setErrorMessage, load, run };
}
