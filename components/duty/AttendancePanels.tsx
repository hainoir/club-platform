'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';
import { RosterWithMember } from '@/hooks/useDuty';
import { isAdminRole, useUserStore } from '@/store/useUserStore';
import { AlertTriangle, MapPin, BookOpen, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-simple';
import { resolveCurrentDutyAvailability } from '@/lib/duty-sign-in';
import { isDutyRequiredDate } from '@/lib/china-public-holidays';
import {
    getStudioLocationErrorMessage,
    isStudioLocationValidationFailure,
    STUDIO_LOCATION_ACTION_COOLDOWN_MS,
    validateStudioLocation,
} from '@/lib/studio-location';
import { cn } from '@/lib/utils';
import {
    addDaysToDateKey,
    getDutyNow,
    getDutyPeriodByMinutes,
    getDutyWeekMondayDateKey,
    resolveDutySignInSlot,
    toDutyDateTimeParts,
} from '@/lib/duty-time';

const PERIOD_RANGES: Record<number, { start: [number, number]; end: [number, number] }> = {
    1: { start: [8, 0], end: [9, 35] },
    2: { start: [10, 5], end: [11, 40] },
    3: { start: [13, 30], end: [15, 5] },
    4: { start: [15, 35], end: [17, 10] },
};

const DAYS_LABEL = ['一', '二', '三', '四', '五'];
const QUERY_TIMEOUT_MS = 10_000;

function getPeriodEndPlusMinutes(period: number, extraMin: number): number {
    const [h, m] = PERIOD_RANGES[period]?.end || [23, 59];
    return h * 60 + m + extraMin;
}

function getMatchedPeriod(minutes: number): number {
    return getDutyPeriodByMinutes(minutes);
}

function isPeriodPast(dateKey: string, period: number): boolean {
    if (!isDutyRequiredDate(dateKey)) return false;

    const now = getDutyNow();
    if (dateKey < now.dateKey) return true;
    if (dateKey > now.dateKey) return false;

    const [endH, endM] = PERIOD_RANGES[period]?.end || [23, 59];
    return now.minutes >= endH * 60 + endM;
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
    return !!(await ensureClientSession(supabase));
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

interface StudioMembersCardProps {
    rosters: RosterWithMember[];
    allowSelfStudy?: boolean;
    allowAdminDeleteStudy?: boolean;
}

interface StudioMember {
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

export function StudioMembersCard({
    rosters,
    allowSelfStudy = true,
    allowAdminDeleteStudy = true,
}: StudioMembersCardProps) {
    const supabase = useMemo(() => createClient(), []);
    const { user } = useUserStore();
    const { toast } = useToast();
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

            const { data: dutyLogs, error: dutyError } = await runWithTimeout<any>(async (signal) =>
                await supabase
                    .from('duty_logs')
                    .select('id, member_id, sign_in_time, sign_in_date, device_info')
                    .eq('sign_in_date', todayDateKey)
                    .eq('location_verified', true)
                    .abortSignal(signal)
            );

            if (dutyError) throw dutyError;

            if (isDutyRequiredDate(todayDateKey)) {
                (dutyLogs || []).forEach((log: { id: string; member_id: string; sign_in_time: string; sign_in_date: string | null; device_info: string | null }) => {
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

            const { data: sessions, error: sessionError } = await runWithTimeout<any>(async (signal) =>
                await supabase
                    .from('studio_sessions')
                    .select('id, member_id, started_at, member:members(id, name)')
                    .eq('is_active', true)
                    .abortSignal(signal)
            );

            if (sessionError) throw sessionError;

            ((sessions as StudioSessionWithMember[] | null) || []).forEach((session) => {
                if (seenIds.has(session.member_id)) return;

                const startParts = toDutyDateTimeParts(session.started_at);
                const startMin = startParts.minutes;
                const matchedPeriod = getMatchedPeriod(startMin);

                if (matchedPeriod > 0) {
                    const periodEndPlus10 = getPeriodEndPlusMinutes(matchedPeriod, 10);
                    if (nowMin > periodEndPlus10) {
                        void supabase
                            .from('studio_sessions')
                            .update({ is_active: false, ended_at: new Date().toISOString() })
                            .eq('id', session.id);
                        return;
                    }
                }

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
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

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
    };

    const handleEndStudy = async () => {
        if (!user) return;
        setEnding(true);
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

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
    };

    const handleAdminDeleteStudy = async (member: StudioMember) => {
        if (!canAdminDeleteStudy || member.type !== 'study') return;

        setDeletingSessionId(member.sessionId);
        try {
            if (!(await ensureSession(supabase))) {
                throw new Error('登录状态已失效，请重新登录。');
            }

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
    };

    const isAlreadyInStudio = studioMembers.some((member) => member.id === user?.id);
    const isSelfStudying = studioMembers.some((member) => member.id === user?.id && member.type === 'study');
    const todayAssignedPeriods = user
        ? Array.from(new Set(rosters.filter((r) => r.member_id === user.id && r.day_of_week === new Date().getDay()).map((r) => r.period)))
        : [];
    const isInOwnDutyPeriod = resolveCurrentDutyAvailability(todayAssignedPeriods).canSignInNow;

    return (
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-green-500" />
                    <span className="font-medium text-muted-foreground">目前在工作室</span>
                    {!loading && studioMembers.length > 0 && (
                        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400">
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
                <p className="text-xs text-muted-foreground">目前工作室暂无人</p>
            ) : (
                <div className="mb-3 flex flex-wrap gap-1.5">
                    {studioMembers.map((member) => (
                        <span
                            key={member.id}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
                                member.type === 'study'
                                    ? 'bg-purple-100 text-purple-700 ring-purple-300/50 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-700/50'
                                    : 'bg-green-100 text-green-700 ring-green-300/50 dark:bg-green-950/30 dark:text-green-400 dark:ring-green-700/50'
                            )}
                        >
                            <span>{member.name}</span>
                            <span className="text-[9px] opacity-70">{member.type === 'study' ? '自习' : '值班'}</span>
                            {canAdminDeleteStudy && member.type === 'study' ? (
                                <button
                                    type="button"
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-70 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={`移除 ${member.name} 的自习记录`}
                                    title={`移除 ${member.name} 的自习记录`}
                                    onClick={() => void handleAdminDeleteStudy(member)}
                                    disabled={deletingSessionId === member.sessionId}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            ) : null}
                        </span>
                    ))}
                </div>
            )}

            {allowSelfStudy && !loading && !errorMsg && !isAlreadyInStudio ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-auto h-8 w-full text-xs"
                    onClick={handleSelfStudy}
                    disabled={isInOwnDutyPeriod || isStartingStudy}
                >
                    {isStartingStudy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <BookOpen className="mr-1 h-3 w-3" />}
                    {isStartingStudy ? '正在验证定位...' : '我在工作室自习'}
                </Button>
            ) : allowSelfStudy && !loading && !errorMsg && isSelfStudying ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-auto h-8 w-full border-orange-300 text-xs text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                    onClick={handleEndStudy}
                    disabled={ending}
                >
                    <X className="mr-1 h-3 w-3" />
                    {ending ? '处理中...' : '结束自习'}
                </Button>
            ) : null}
        </div>
    );
}
