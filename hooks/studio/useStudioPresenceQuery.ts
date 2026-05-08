import { useCallback, useState } from 'react';

import { useVisibilitySync } from '@/hooks/shared/useVisibilitySync';
import { extractErrorMessage, runWithTimeout } from '@/lib/shared/client-request';
import { isDutyRequiredDate } from '@/lib/duty/china-public-holidays';
import {
    getDutyNow,
    getDutyPeriodByMinutes,
    getDutyPeriodEndMinutes,
    toDutyDateTimeParts,
} from '@/lib/duty/duty-time';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';

import type { PostgrestError } from '@supabase/supabase-js';
import type { SupabaseBrowserClient } from '@/hooks/shared/useSupabase';
import type { RosterWithMember } from '@/hooks/useDuty';
import type { Database } from '@/types/supabase';
import type { StudioMember } from './types';

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

async function ensureSession(supabase: SupabaseBrowserClient): Promise<boolean> {
    return !!(await ensureClientSession(supabase));
}

function getPeriodEndPlusMinutes(period: number, extraMin: number): number {
    return getDutyPeriodEndMinutes(period) + extraMin;
}

export function useStudioPresenceQuery(supabase: SupabaseBrowserClient, rosters: RosterWithMember[]) {
    const [studioMembers, setStudioMembers] = useState<StudioMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
                await supabase.rpc('expire_studio_sessions', { p_now: new Date().toISOString() }).abortSignal(signal)
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
                    let matchedPeriod = getDutyPeriodByMinutes(signInParts.minutes);
                    if (matchedPeriod === 0) matchedPeriod = 1;

                    if (nowMin > getPeriodEndPlusMinutes(matchedPeriod, 10)) return;

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
                const matchedPeriod = getDutyPeriodByMinutes(startParts.minutes);
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

    return {
        studioMembers,
        loading,
        errorMsg,
        fetchStudioMembers,
    };
}
