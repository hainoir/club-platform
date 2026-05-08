import { useCallback, useRef, useState } from 'react';

import { extractErrorMessage } from '@/lib/shared/client-request';
import {
    getStudioLocationErrorMessage,
    isStudioLocationValidationFailure,
    STUDIO_LOCATION_ACTION_COOLDOWN_MS,
    validateStudioLocation,
} from '@/lib/studio/studio-location';

import type { SupabaseBrowserClient } from '@/hooks/shared/useSupabase';
import type { AppUser } from '@/lib/app-user';
import type { StudioMember } from './types';

interface UseSelfStudyActionsOptions {
    supabase: SupabaseBrowserClient;
    user: AppUser | null;
    studioMembers: StudioMember[];
    requireAuth: () => Promise<boolean>;
    toast: (toast: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
    refreshStudioMembers: () => void | Promise<void>;
}

export function useSelfStudyActions({
    supabase,
    user,
    studioMembers,
    requireAuth,
    toast,
    refreshStudioMembers,
}: UseSelfStudyActionsOptions) {
    const [ending, setEnding] = useState(false);
    const [isStartingStudy, setIsStartingStudy] = useState(false);
    const lastStartStudyAttemptAtRef = useRef(0);

    const startSelfStudy = useCallback(async () => {
        if (!user || isStartingStudy) return;

        const nowTs = Date.now();
        const elapsed = nowTs - lastStartStudyAttemptAtRef.current;
        if (elapsed < STUDIO_LOCATION_ACTION_COOLDOWN_MS) {
            const waitSeconds = Math.max(1, Math.ceil((STUDIO_LOCATION_ACTION_COOLDOWN_MS - elapsed) / 1000));
            toast({
                title: '请求过于频繁',
                description: `请等待 ${waitSeconds} 秒后再尝试开始自习。`,
                variant: 'destructive',
            });
            return;
        }
        lastStartStudyAttemptAtRef.current = nowTs;

        setIsStartingStudy(true);
        try {
            if (!(await requireAuth())) return;

            await validateStudioLocation();

            const { error } = await supabase.from('studio_sessions').insert({ member_id: user.id });
            if (error) throw error;

            toast({ title: '自习已开始', description: '已记录你在工作室自习。' });
            void refreshStudioMembers();
        } catch (err) {
            const description = isStudioLocationValidationFailure(err)
                ? getStudioLocationErrorMessage(err)
                : extractErrorMessage(err, '请检查数据库权限策略后重试。');
            toast({
                title: '开始自习失败',
                description,
                variant: 'destructive',
            });
        } finally {
            setIsStartingStudy(false);
        }
    }, [isStartingStudy, refreshStudioMembers, requireAuth, supabase, toast, user]);

    const endSelfStudy = useCallback(async () => {
        if (!user) return;
        setEnding(true);
        try {
            if (!(await requireAuth())) return;

            const mySession = studioMembers.find((member) => member.id === user.id && member.type === 'study');
            if (mySession) {
                const { error } = await supabase
                    .from('studio_sessions')
                    .update({ is_active: false, ended_at: new Date().toISOString() })
                    .eq('id', mySession.sessionId);
                if (error) throw error;
            }

            toast({ title: '已结束自习' });
            void refreshStudioMembers();
        } catch (err) {
            toast({
                title: '结束自习失败',
                description: extractErrorMessage(err, '请检查数据库权限策略后重试。'),
                variant: 'destructive',
            });
        } finally {
            setEnding(false);
        }
    }, [refreshStudioMembers, requireAuth, studioMembers, supabase, toast, user]);

    return {
        ending,
        isStartingStudy,
        startSelfStudy,
        endSelfStudy,
    };
}
