import { useCallback, useState } from 'react';

import { extractErrorMessage } from '@/lib/shared/client-request';

import type { SupabaseBrowserClient } from '@/hooks/shared/useSupabase';
import type { StudioMember } from './types';

interface UseStudioAdminActionsOptions {
    supabase: SupabaseBrowserClient;
    canAdminDeleteStudy: boolean;
    requireAuth: () => Promise<boolean>;
    toast: (toast: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
    refreshStudioMembers: () => void | Promise<void>;
}

export function useStudioAdminActions({
    supabase,
    canAdminDeleteStudy,
    requireAuth,
    toast,
    refreshStudioMembers,
}: UseStudioAdminActionsOptions) {
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

    const deleteStudySession = useCallback(async (member: StudioMember) => {
        if (!canAdminDeleteStudy || member.type !== 'study') return;

        setDeletingSessionId(member.sessionId);
        try {
            if (!(await requireAuth())) return;

            const { error } = await supabase.from('studio_sessions').delete().eq('id', member.sessionId);
            if (error) throw error;

            toast({ title: '已移除自习记录', description: `${member.name} 已从工作室列表移除。` });
            void refreshStudioMembers();
        } catch (err) {
            toast({
                title: '移除自习记录失败',
                description: extractErrorMessage(err, '请检查数据库权限策略后重试。'),
                variant: 'destructive',
            });
        } finally {
            setDeletingSessionId(null);
        }
    }, [canAdminDeleteStudy, refreshStudioMembers, requireAuth, supabase, toast]);

    return {
        deletingSessionId,
        deleteStudySession,
    };
}
