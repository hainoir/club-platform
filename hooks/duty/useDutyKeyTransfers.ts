import { useCallback, useState } from 'react';

import { EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER } from '@/lib/duty/keyTransferFilters';

import {
    type DutyHookContext,
    type KeyTransferWithMember,
    type RefreshCallback,
} from './types';

interface UseDutyKeyTransfersOptions extends DutyHookContext {
    refreshRosters: RefreshCallback;
}

function getErrorMessage(error: unknown): string {
    return (error as { message?: string })?.message || '操作失败，请稍后重试。';
}

export function useDutyKeyTransfers({
    supabase,
    user,
    toast,
    ensureActiveSession,
    refreshRosters,
}: UseDutyKeyTransfersOptions) {
    const [keyTransfers, setKeyTransfers] = useState<KeyTransferWithMember[]>([]);

    const refreshKeyTransfers = useCallback(async () => {
        const { data, error } = await supabase
            .from('key_transfers')
            .select('*, from_member:members!key_transfers_from_member_id_fkey(id, name), to_member:members!key_transfers_to_member_id_fkey(id, name)')
            .or(EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER)
            .order('created_at', { ascending: false })
            .limit(10)
            .returns<KeyTransferWithMember[]>();

        if (!error && data) {
            setKeyTransfers(data);
        }
    }, [supabase]);

    // 【学习注释：交接发起】
    const submitKeyTransfer = useCallback(async (toMemberId: string, note: string) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;
        try {
            const { error } = await supabase
                .from('key_transfers')
                .insert({
                    from_member_id: user.id,
                    to_member_id: toMemberId,
                    note: note || null,
                });

            if (error) throw error;
            toast({ title: '已发起钥匙交接', description: '等待接收人确认。' });
            void refreshKeyTransfers();
            return true;
        } catch (error) {
            toast({ title: '发起失败', description: getErrorMessage(error), variant: 'destructive' });
            return false;
        }
    }, [ensureActiveSession, refreshKeyTransfers, supabase, toast, user]);

    // 【学习注释：交接确认】
    const confirmKeyTransfer = useCallback(async (transferId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase.rpc('confirm_key_transfer', {
                p_transfer_id: transferId,
                p_confirmer_id: user.id,
            });

            if (error) throw error;
            toast({ title: '钥匙交接完成！', description: '您已确认接收钥匙，排班表钥匙标记已更新。' });
            void refreshKeyTransfers();
            void refreshRosters();
        } catch (error) {
            toast({ title: '确认失败', description: getErrorMessage(error), variant: 'destructive' });
        }
    }, [ensureActiveSession, refreshKeyTransfers, refreshRosters, supabase, toast, user]);

    return {
        keyTransfers,
        refreshKeyTransfers,
        submitKeyTransfer,
        confirmKeyTransfer,
    };
}
