import { useCallback, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toast-simple';
import { useSupabase, type SupabaseBrowserClient } from '@/hooks/shared/useSupabase';
import { useVisibilitySync } from '@/hooks/shared/useVisibilitySync';
import { extractErrorMessage, runWithTimeout } from '@/lib/shared/client-request';
import { isDutyRequiredDate } from '@/lib/duty/china-public-holidays';
import { resolveCurrentDutyAvailability } from '@/lib/duty/duty-sign-in';
import {
    getDutyNow,
    getDutyPeriodByMinutes,
    getDutyPeriodEndMinutes,
    toDutyDateTimeParts,
} from '@/lib/duty/duty-time';
import {
    getStudioLocationErrorMessage,
    isStudioLocationValidationFailure,
    STUDIO_LOCATION_ACTION_COOLDOWN_MS,
    validateStudioLocation,
} from '@/lib/studio/studio-location';
import { isAdminRole, useUserStore } from '@/store/useUserStore';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';
import { useProtectedAction } from '@/hooks/shared/useProtectedAction';

import type { PostgrestError } from '@supabase/supabase-js';
import type { RosterWithMember } from '@/hooks/useDuty';
import type { Database } from '@/types/supabase';

function getPeriodEndPlusMinutes(period: number, extraMin: number): number {
    return getDutyPeriodEndMinutes(period) + extraMin;
}

function getMatchedPeriod(minutes: number): number {
    return getDutyPeriodByMinutes(minutes);
}

async function ensureSession(supabase: SupabaseBrowserClient): Promise<boolean> {
    return !!(await ensureClientSession(supabase));
}

export interface StudioMember {
    id: string;
    sessionId: string;
    name: string;
    type: 'duty' | 'study';
    period: number;
}

interface StudioSessionWithMember {
    id: string;
    member_id: string;
    started_at: string;
    member: {
        id: string;
        name: string | null;
    } | null;
}

type DutyLogPresence = Pick<
    Database['public']['Tables']['duty_logs']['Row'],
    'id' | 'member_id' | 'sign_in_time' | 'sign_in_date' | 'device_info'
>;

type PostgrestListResult<T> = {
    data: T[] | null;
    error: PostgrestError | null;
};

type PostgrestSingleResult<T> = {
    data: T | null;
    error: PostgrestError | null;
};

interface UseStudioPresenceOptions {
    rosters: RosterWithMember[];
    allowAdminDeleteStudy?: boolean;
}

export function useStudioPresence({
    rosters,
    allowAdminDeleteStudy = true,
}: UseStudioPresenceOptions) {
    const supabase = useSupabase();
    const { user } = useUserStore();
    const { toast } = useToast();
    const { requireAuth } = useProtectedAction();
    const [studioMembers, setStudioMembers] = useState<StudioMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [ending, setEnding] = useState(false);
    const [isStartingStudy, setIsStartingStudy] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const lastStartStudyAttemptAtRef = useRef(0);
    const isAdmin = isAdminRole(user?.role);
    const canAdminDeleteStudy = allowAdminDeleteStudy && isAdmin;

    const fetchStudioMembers = useCallback(async () => {
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

            const dutyNow = getDutyNow();
            const todayDateKey = dutyNow.dateKey;
            const nowMin = dutyNow.minutes;
            const members: StudioMember[] = [];
            const seenIds = new Set<string>();

            const { error: expireError } = await runWithTimeout<PostgrestSingleResult<number>>(async (signal) =>
                await supabase.rpc('expire_studio_sessions', {}).abortSignal(signal)
            );

            if (expireError) throw expireError;

            const { data: dutyLogs, error: dutyError } = await runWithTimeout<PostgrestListResult<DutyLogPresence>>(async (signal) =>
                await supabase
                    .from('duty_logs')
                    .select('id, member_id, sign_in_time, sign_in_date, device_info')
                    .eq('sign_in_date', todayDateKey)
                    .eq('location_verified', true)
                    .abortSignal(signal)
            );

            if (dutyError) throw dutyError;

            if (isDutyRequiredDate(todayDateKey)) {
                (dutyLogs || []).forEach((log) => {
                    if (seenIds.has(log.member_id)) return;
                    if (log.device_info?.includes('self-study')) return;

                    const signInParts = toDutyDateTimeParts(log.sign_in_time);
                    const signMin = signInParts.minutes;
                    let matchedPeriod = getMatchedPeriod(signMin);
                    if (matchedPeriod === 0) matchedPeriod = 1;

                    const periodEndPlus10 = getPeriodEndPlusMinutes(matchedPeriod, 10);
                    if (nowMin > periodEndPlus10) return;

                    const roster = rosters.find((r) => r.member_id === log.member_id);
                    members.push({
                        id: log.member_id,
                        sessionId: log.id,
                        name: roster?.member.name || '成员',
                        type: 'duty',
                        period: matchedPeriod,
                    });
                    seenIds.add(log.member_id);
                });
            }

            const { data: sessions, error: sessionError } = await runWithTimeout<PostgrestListResult<StudioSessionWithMember>>(async (signal) =>
                await supabase
                    .from('studio_sessions')
                    .select('id, member_id, started_at, member:members(id, name)')
                    .eq('is_active', true)
                    .abortSignal(signal)
            );

            if (sessionError) throw sessionError;

            (sessions || []).forEach((session) => {
                if (seenIds.has(session.member_id)) return;

                const startParts = toDutyDateTimeParts(session.started_at);
                const startMin = startParts.minutes;
                const matchedPeriod = getMatchedPeriod(startMin);

                const roster = rosters.find((r) => r.member_id === session.member_id);
                const sessionMemberName = session.member?.name?.trim() || '';
                members.push({
                    id: session.member_id,
                    sessionId: session.id,
                    name: sessionMemberName || roster?.member.name || '成员',
                    type: 'study',
                    period: matchedPeriod,
                });
                seenIds.add(session.member_id);
            });

            setStudioMembers(members);
            setErrorMsg(null);
        } catch (err) {
            setStudioMembers([]);
            setErrorMsg(extractErrorMessage(err, '无法读取工作室在场数据'));
        } finally {
            setLoading(false);
        }
    }, [rosters, supabase]);

    useVisibilitySync(fetchStudioMembers, { intervalMs: 30_000 });

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
            void fetchStudioMembers();
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
    }, [fetchStudioMembers, isStartingStudy, requireAuth, supabase, toast, user]);

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
            void fetchStudioMembers();
        } catch (err) {
            toast({
                title: '结束自习失败',
                description: extractErrorMessage(err, '请检查数据库权限策略后重试。'),
                variant: 'destructive',
            });
        } finally {
            setEnding(false);
        }
    }, [fetchStudioMembers, requireAuth, studioMembers, supabase, toast, user]);

    const deleteStudySession = useCallback(async (member: StudioMember) => {
        if (!canAdminDeleteStudy || member.type !== 'study') return;

        setDeletingSessionId(member.sessionId);
        try {
            if (!(await requireAuth())) return;

            const { error } = await supabase.from('studio_sessions').delete().eq('id', member.sessionId);
            if (error) throw error;

            toast({ title: '已移除自习记录', description: `${member.name} 已从工作室列表移除。` });
            void fetchStudioMembers();
        } catch (err) {
            toast({
                title: '移除自习记录失败',
                description: extractErrorMessage(err, '请检查数据库权限策略后重试。'),
                variant: 'destructive',
            });
        } finally {
            setDeletingSessionId(null);
        }
    }, [canAdminDeleteStudy, fetchStudioMembers, requireAuth, supabase, toast]);

    const isAlreadyInStudio = studioMembers.some((member) => member.id === user?.id);
    const isSelfStudying = studioMembers.some((member) => member.id === user?.id && member.type === 'study');
    const todayAssignedPeriods = user
        ? Array.from(new Set(rosters.filter((r) => r.member_id === user.id && r.day_of_week === new Date().getDay()).map((r) => r.period)))
        : [];
    const isInOwnDutyPeriod = resolveCurrentDutyAvailability(todayAssignedPeriods).canSignInNow;

    return {
        studioMembers,
        loading,
        ending,
        isStartingStudy,
        deletingSessionId,
        errorMsg,
        canAdminDeleteStudy,
        isAlreadyInStudio,
        isSelfStudying,
        isInOwnDutyPeriod,
        startSelfStudy,
        endSelfStudy,
        deleteStudySession,
    };
}
