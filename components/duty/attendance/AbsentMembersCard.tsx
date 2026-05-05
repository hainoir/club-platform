'use client';

import { useCallback, useMemo, useState } from 'react';

import { AlertTriangle } from 'lucide-react';

import { useSupabase, type SupabaseBrowserClient } from '@/hooks/shared/useSupabase';
import { useVisibilitySync } from '@/hooks/shared/useVisibilitySync';
import { extractErrorMessage, runWithTimeout } from '@/lib/shared/client-request';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';
import { isDutyRequiredDate } from '@/lib/duty/china-public-holidays';
import {
    addDaysToDateKey,
    getDutyNow,
    getDutyWeekMondayDateKey,
    resolveDutySignInSlot,
} from '@/lib/duty/duty-time';

import type { RosterWithMember } from '@/hooks/useDuty';

const PERIOD_RANGES: Record<number, { end: [number, number] }> = {
    1: { end: [9, 35] },
    2: { end: [11, 40] },
    3: { end: [15, 5] },
    4: { end: [17, 10] },
};

const DAYS_LABEL = ['一', '二', '三', '四', '五'];

function isPeriodPast(dateKey: string, period: number): boolean {
    if (!isDutyRequiredDate(dateKey)) return false;

    const now = getDutyNow();
    if (dateKey < now.dateKey) return true;
    if (dateKey > now.dateKey) return false;

    const [endH, endM] = PERIOD_RANGES[period]?.end || [23, 59];
    return now.minutes >= endH * 60 + endM;
}

async function ensureSession(supabase: SupabaseBrowserClient): Promise<boolean> {
    return !!(await ensureClientSession(supabase));
}

interface AbsentMembersCardProps {
    rosters: RosterWithMember[];
}

export function AbsentMembersCard({ rosters }: AbsentMembersCardProps) {
    const supabase = useSupabase();
    const [signedSlotKeys, setSignedSlotKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchSignIns = useCallback(async () => {
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

            const mondayDateKey = getDutyWeekMondayDateKey(new Date());
            const { data, error } = await runWithTimeout<any>(async (signal) =>
                await supabase
                    .from('duty_logs')
                    .select('member_id, sign_in_time, sign_in_date')
                    .gte('sign_in_date', mondayDateKey)
                    .eq('location_verified', true)
                    .abortSignal(signal)
            );

            if (error) throw error;

            const nextSignedSlots = new Set<string>();
            (data || []).forEach((log: { member_id: string; sign_in_time: string; sign_in_date: string | null }) => {
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

    const absentMembers = useMemo(() => {
        const map = new Map<string, { name: string; slots: string[] }>();
        const mondayDateKey = getDutyWeekMondayDateKey(new Date());

        rosters.forEach((r) => {
            const slotDateKey = addDaysToDateKey(mondayDateKey, r.day_of_week - 1);
            if (!isPeriodPast(slotDateKey, r.period)) return;

            const slotKey = `${r.member_id}-${slotDateKey}-${r.period}`;
            if (signedSlotKeys.has(slotKey)) return;

            const existing = map.get(r.member_id);
            const slotLabel = `周${DAYS_LABEL[r.day_of_week - 1]}第${r.period}节`;
            if (existing) {
                existing.slots.push(slotLabel);
            } else {
                map.set(r.member_id, { name: r.member.name, slots: [slotLabel] });
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
                        <div key={member.id} className="flex items-center justify-between text-xs">
                            <span className="font-medium text-orange-700 dark:text-orange-400">{member.name}</span>
                            <span className="text-muted-foreground">{member.slots.join('、')}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
