'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useSupabase, type SupabaseBrowserClient } from '@/hooks/shared/useSupabase';
import { useVisibilitySync } from '@/hooks/shared/useVisibilitySync';
import { extractErrorMessage, runWithTimeout } from '@/lib/shared/client-request';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';
import { isDutyRequiredDate } from '@/lib/duty/china-public-holidays';
import {
    addDaysToDateKey,
    getDutyNow,
    getDutyPeriodEndMinutes,
    getDutyWeekMondayDateKey,
    resolveDutySignInSlot,
} from '@/lib/duty/duty-time';

import type { PostgrestError } from '@supabase/supabase-js';
import type { RosterWithMember } from '@/hooks/useDuty';
import type { Database } from '@/types/supabase';
import { isAdminRole, useUserStore } from '@/store/useUserStore';
import type { BackfillSlot } from './DutySignInAdminSection';

const DAYS_LABEL = ['一', '二', '三', '四', '五'];

function isPeriodPast(dateKey: string, period: number): boolean {
    if (!isDutyRequiredDate(dateKey)) return false;

    const now = getDutyNow();
    if (dateKey < now.dateKey) return true;
    if (dateKey > now.dateKey) return false;

    return now.minutes >= getDutyPeriodEndMinutes(period);
}

async function ensureSession(supabase: SupabaseBrowserClient): Promise<boolean> {
    return !!(await ensureClientSession(supabase));
}

interface AbsentMembersCardProps {
    rosters: RosterWithMember[];
    refreshKey?: number;
    onBackfill?: (slot: BackfillSlot) => void;
}

type DutyLogSignIn = Pick<
    Database['public']['Tables']['duty_logs']['Row'],
    'member_id' | 'sign_in_time' | 'sign_in_date'
>;

type PostgrestListResult<T> = {
    data: T[] | null;
    error: PostgrestError | null;
};

export function AbsentMembersCard({ rosters, refreshKey = 0, onBackfill }: AbsentMembersCardProps) {
    const supabase = useSupabase();
    const { user } = useUserStore();
    const [signedSlotKeys, setSignedSlotKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchSignIns = useCallback(async () => {
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

            const mondayDateKey = getDutyWeekMondayDateKey(new Date());
            const { data, error } = await runWithTimeout<PostgrestListResult<DutyLogSignIn>>(async (signal) =>
                await supabase
                    .from('duty_logs')
                    .select('member_id, sign_in_time, sign_in_date')
                    .gte('sign_in_date', mondayDateKey)
                    .eq('location_verified', true)
                    .abortSignal(signal)
            );

            if (error) throw error;

            const nextSignedSlots = new Set<string>();
            (data || []).forEach((log) => {
                const slot = resolveDutySignInSlot(log);
                if (!slot) return;
                nextSignedSlots.add(slot.slotKey);
            });

            setSignedSlotKeys(nextSignedSlots);
            setErrorMsg(null);
        } catch (err) {
            setSignedSlotKeys(new Set());
            setErrorMsg(extractErrorMessage(err, '无法读取本周签到数据'));
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useVisibilitySync(fetchSignIns, { intervalMs: 60_000 });
    useEffect(() => { if (refreshKey > 0) void fetchSignIns(); }, [fetchSignIns, refreshKey]);

    const absentMembers = useMemo(() => {
        const map = new Map<string, { name: string; slots: Array<{ label: string; dateKey: string; period: number }> }>();
        const mondayDateKey = getDutyWeekMondayDateKey(new Date());

        rosters.forEach((r) => {
            const slotDateKey = addDaysToDateKey(mondayDateKey, r.day_of_week - 1);
            if (!isPeriodPast(slotDateKey, r.period)) return;

            const slotKey = `${r.member_id}-${slotDateKey}-${r.period}`;
            if (signedSlotKeys.has(slotKey)) return;

            const existing = map.get(r.member_id);
            const slotLabel = `周${DAYS_LABEL[r.day_of_week - 1]}第${r.period}节`;
            if (existing) {
                existing.slots.push({ label: slotLabel, dateKey: slotDateKey, period: r.period });
            } else {
                map.set(r.member_id, { name: r.member.name, slots: [{ label: slotLabel, dateKey: slotDateKey, period: r.period }] });
            }
        });

        return Array.from(map.entries()).map(([id, info]) => ({ id, ...info }));
    }, [rosters, signedSlotKeys]);

    return (
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
                <span className="font-medium text-muted-foreground">本周未签到人员</span>
            </div>

            {loading ? (
                <p className="text-xs text-muted-foreground">数据加载中...</p>
            ) : errorMsg ? (
                <p className="text-xs text-destructive">{errorMsg}</p>
            ) : absentMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">本周所有已结束班次均已签到</p>
            ) : (
                <div className="space-y-1.5">
                    {absentMembers.map((member) => (
                        <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-orange-700 dark:text-orange-400">{member.name}</span>
                            <span className="flex flex-wrap items-center gap-1 text-muted-foreground">
                                {member.slots.map((slot) => <span key={`${slot.dateKey}-${slot.period}`}>
                                    {slot.label}
                                    {onBackfill && isAdminRole(user?.role) ? <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => onBackfill({ memberId: member.id, dateKey: slot.dateKey, period: slot.period })}>补签</Button> : null}
                                </span>)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
