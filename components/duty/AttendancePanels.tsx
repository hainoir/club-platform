'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { rehydrateSessionFromServer } from '@/utils/supabase/rehydrate';
import { RosterWithMember } from '@/hooks/useDuty';
import { useUserStore } from '@/store/useUserStore';
import { AlertTriangle, MapPin, BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-simple';
import { cn } from '@/lib/utils';

const PERIOD_RANGES: Record<number, { start: [number, number]; end: [number, number] }> = {
    1: { start: [8, 0], end: [9, 35] },
    2: { start: [10, 5], end: [11, 40] },
    3: { start: [13, 30], end: [15, 5] },
    4: { start: [15, 35], end: [17, 10] },
};

const DAYS_LABEL = ['一', '二', '三', '四', '五'];
const QUERY_TIMEOUT_MS = 10_000;

function getLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getPeriodEndPlusMinutes(period: number, extraMin: number): number {
    const [h, m] = PERIOD_RANGES[period]?.end || [23, 59];
    return h * 60 + m + extraMin;
}

function getNowMinutes(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function getMatchedPeriod(minutes: number): number {
    for (const [pid, range] of Object.entries(PERIOD_RANGES)) {
        const startMin = range.start[0] * 60 + range.start[1] - 30;
        const endMin = range.end[0] * 60 + range.end[1];
        if (minutes >= startMin && minutes <= endMin) {
            return Number(pid);
        }
    }
    return 0;
}

function getTodayDow(): number {
    return new Date().getDay(); // 0=Sun, 1=Mon...5=Fri
}

function isPeriodPast(day: number, period: number): boolean {
    const todayDow = getTodayDow();
    if (todayDow > day && todayDow <= 5) return true;
    if (todayDow !== day) return false;
    const [endH, endM] = PERIOD_RANGES[period]?.end || [23, 59];
    return getNowMinutes() >= endH * 60 + endM;
}

function getWeekMonday(): Date {
    const now = new Date();
    const dow = now.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function extractErrorMessage(err: unknown, fallback: string): string {
    const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message || '') : '';
    return message || fallback;
}

async function runWithTimeout<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
        return await request(controller.signal);
    } finally {
        window.clearTimeout(timer);
    }
}

async function ensureSession(supabase: ReturnType<typeof createClient>): Promise<boolean> {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (session) return true;

    const bridged = await rehydrateSessionFromServer(supabase);
    if (bridged) {
        const {
            data: { session: bridgedSession },
        } = await supabase.auth.getSession();
        if (bridgedSession) return true;
    }

    const {
        data: { session: refreshedSession },
    } = await supabase.auth.refreshSession();
    return !!refreshedSession;
}

interface AbsentMembersCardProps {
    rosters: RosterWithMember[];
}

export function AbsentMembersCard({ rosters }: AbsentMembersCardProps) {
    const supabase = useMemo(() => createClient(), []);
    const [signedSlotKeys, setSignedSlotKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchSignIns = useCallback(async () => {
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

            const monday = getWeekMonday();
            const { data, error } = await runWithTimeout<any>(async (signal) =>
                await supabase
                    .from('duty_logs')
                    .select('member_id, sign_in_time')
                    .gte('sign_in_time', monday.toISOString())
                    .eq('location_verified', true)
                    .abortSignal(signal)
            );

            if (error) throw error;

            const nextSignedSlots = new Set<string>();
            (data || []).forEach((log: { member_id: string; sign_in_time: string }) => {
                const signTime = new Date(log.sign_in_time);
                const signMinutes = signTime.getHours() * 60 + signTime.getMinutes();
                const matchedPeriod = getMatchedPeriod(signMinutes);
                const dayOfWeek = signTime.getDay();
                if (matchedPeriod === 0 || dayOfWeek < 1 || dayOfWeek > 5) return;

                const slotKey = `${log.member_id}-${getLocalDateKey(signTime)}-${matchedPeriod}`;
                nextSignedSlots.add(slotKey);
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

    useEffect(() => {
        const syncSignIns = () => {
            void fetchSignIns();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncSignIns();
            }
        };

        syncSignIns();
        const timer = setInterval(syncSignIns, 60_000);
        window.addEventListener('focus', syncSignIns);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', syncSignIns);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchSignIns]);

    const absentMembers = React.useMemo(() => {
        const map = new Map<string, { name: string; slots: string[] }>();
        const monday = getWeekMonday();

        rosters.forEach((r) => {
            if (!isPeriodPast(r.day_of_week, r.period)) return;

            const slotDate = new Date(monday);
            slotDate.setDate(monday.getDate() + (r.day_of_week - 1));
            const slotKey = `${r.member_id}-${getLocalDateKey(slotDate)}-${r.period}`;
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
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm mb-3">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
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
                    {absentMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-xs">
                            <span className="font-medium text-orange-700 dark:text-orange-400">{m.name}</span>
                            <span className="text-muted-foreground">{m.slots.join('、')}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface StudioMembersCardProps {
    rosters: RosterWithMember[];
}

interface StudioMember {
    id: string;
    sessionId: string;
    name: string;
    type: 'duty' | 'study';
    period: number;
}

export function StudioMembersCard({ rosters }: StudioMembersCardProps) {
    const supabase = useMemo(() => createClient(), []);
    const { user } = useUserStore();
    const { toast } = useToast();
    const [studioMembers, setStudioMembers] = useState<StudioMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [ending, setEnding] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchStudioMembers = useCallback(async () => {
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nowMin = getNowMinutes();
            const members: StudioMember[] = [];
            const seenIds = new Set<string>();

            const { data: dutyLogs, error: dutyError } = await runWithTimeout<any>(async (signal) =>
                await supabase
                    .from('duty_logs')
                    .select('id, member_id, sign_in_time, device_info')
                    .gte('sign_in_time', today.toISOString())
                    .eq('location_verified', true)
                    .abortSignal(signal)
            );

            if (dutyError) throw dutyError;

            (dutyLogs || []).forEach((log: { id: string; member_id: string; sign_in_time: string; device_info: string | null }) => {
                if (seenIds.has(log.member_id)) return;
                if (log.device_info?.includes('self-study')) return;

                const signTime = new Date(log.sign_in_time);
                const signMin = signTime.getHours() * 60 + signTime.getMinutes();
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

            const { data: sessions, error: sessionError } = await runWithTimeout<any>(async (signal) =>
                await supabase
                    .from('studio_sessions')
                    .select('id, member_id, started_at')
                    .eq('is_active', true)
                    .abortSignal(signal)
            );

            if (sessionError) throw sessionError;

            (sessions || []).forEach((s: { id: string; member_id: string; started_at: string }) => {
                if (seenIds.has(s.member_id)) return;

                const startTime = new Date(s.started_at);
                const startMin = startTime.getHours() * 60 + startTime.getMinutes();
                const matchedPeriod = getMatchedPeriod(startMin);

                if (matchedPeriod > 0) {
                    const periodEndPlus10 = getPeriodEndPlusMinutes(matchedPeriod, 10);
                    if (nowMin > periodEndPlus10) {
                        void supabase
                            .from('studio_sessions')
                            .update({ is_active: false, ended_at: new Date().toISOString() })
                            .eq('id', s.id);
                        return;
                    }
                }

                const roster = rosters.find((r) => r.member_id === s.member_id);
                members.push({
                    id: s.member_id,
                    sessionId: s.id,
                    name: roster?.member.name || '成员',
                    type: 'study',
                    period: matchedPeriod,
                });
                seenIds.add(s.member_id);
            });

            setStudioMembers(members);
            setErrorMsg(null);
        } catch (err) {
            setStudioMembers([]);
            setErrorMsg(extractErrorMessage(err, '无法读取工作室在场数据'));
        } finally {
            setLoading(false);
        }
    }, [supabase, rosters]);

    useEffect(() => {
        const syncStudioMembers = () => {
            void fetchStudioMembers();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncStudioMembers();
            }
        };

        syncStudioMembers();
        const timer = setInterval(syncStudioMembers, 30_000);
        window.addEventListener('focus', syncStudioMembers);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', syncStudioMembers);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchStudioMembers]);

    const handleSelfStudy = async () => {
        if (!user) return;
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }
            const { error } = await supabase.from('studio_sessions').insert({ member_id: user.id });
            if (error) throw error;
            toast({ title: '自习已开始', description: '已记录你在工作室自习。' });
            void fetchStudioMembers();
        } catch (err) {
            toast({
                title: '开始自习失败',
                description: extractErrorMessage(err, '请检查数据库权限策略后重试。'),
                variant: 'destructive',
            });
        }
    };

    const handleEndStudy = async () => {
        if (!user) return;
        setEnding(true);
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

            const mySession = studioMembers.find((m) => m.id === user.id && m.type === 'study');
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
    };

    const isAlreadyInStudio = studioMembers.some((m) => m.id === user?.id);
    const isSelfStudying = studioMembers.some((m) => m.id === user?.id && m.type === 'study');

    return (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="font-medium text-muted-foreground">目前在工作室</span>
                    {!loading && studioMembers.length > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                            {studioMembers.length}人
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <p className="text-xs text-muted-foreground">数据加载中...</p>
            ) : errorMsg ? (
                <p className="text-xs text-destructive">{errorMsg}</p>
            ) : studioMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">目前工作室暂无人员</p>
            ) : (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {studioMembers.map((m) => (
                        <span
                            key={m.id}
                            className={cn(
                                'inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ring-1 ring-inset',
                                m.type === 'study'
                                    ? 'bg-purple-100 text-purple-700 ring-purple-300/50 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-700/50'
                                    : 'bg-green-100 text-green-700 ring-green-300/50 dark:bg-green-950/30 dark:text-green-400 dark:ring-green-700/50'
                            )}
                        >
                            {m.name}
                            <span className="text-[9px] opacity-70 ml-1">{m.type === 'study' ? '自习' : '值班'}</span>
                        </span>
                    ))}
                </div>
            )}

            {!loading && !errorMsg && !isAlreadyInStudio ? (
                <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={handleSelfStudy}>
                    <BookOpen className="w-3 h-3 mr-1" />
                    我在工作室自习
                </Button>
            ) : !loading && !errorMsg && isSelfStudying ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30"
                    onClick={handleEndStudy}
                    disabled={ending}
                >
                    <X className="w-3 h-3 mr-1" />
                    {ending ? '处理中...' : '结束自习'}
                </Button>
            ) : null}
        </div>
    );
}
