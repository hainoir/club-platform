'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { RosterWithMember } from '@/hooks/useDuty';
import { useUserStore } from '@/store/useUserStore';
import { AlertTriangle, MapPin, BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// 每节课的时间范围（小时:分钟）
const PERIOD_RANGES: Record<number, { start: [number, number]; end: [number, number] }> = {
    1: { start: [8, 0], end: [9, 35] },
    2: { start: [10, 5], end: [11, 40] },
    3: { start: [13, 30], end: [15, 5] },
    4: { start: [15, 35], end: [17, 10] },
};

const DAYS_LABEL = ['一', '二', '三', '四', '五'];

// 各节次结束后 10 分钟的时间限（分钟表示）
function getPeriodEndPlusMinutes(period: number, extraMin: number): number {
    const [h, m] = PERIOD_RANGES[period]?.end || [23, 59];
    return h * 60 + m + extraMin;
}

function getNowMinutes(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

function getTodayDow(): number {
    return new Date().getDay(); // 0=周日, 1=周一...5=周五
}

// 判断某个 (day, period) 是否已过（节次已结束）
function isPeriodPast(day: number, period: number): boolean {
    const todayDow = getTodayDow();
    if (todayDow > day && todayDow <= 5) return true;
    if (todayDow !== day) return false;
    const [endH, endM] = PERIOD_RANGES[period]?.end || [23, 59];
    const nowMin = getNowMinutes();
    return nowMin >= endH * 60 + endM;
}

// 获取本周一的日期
function getWeekMonday(): Date {
    const now = new Date();
    const dow = now.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

// ===================================================================
// 组件 1: 本周未签到人员
// ===================================================================
interface AbsentMembersCardProps {
    rosters: RosterWithMember[];
}

export function AbsentMembersCard({ rosters }: AbsentMembersCardProps) {
    const supabase = createClient();
    const [signedMemberIds, setSignedMemberIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    // 获取本周所有签到记录
    const fetchSignIns = useCallback(async () => {
        const monday = getWeekMonday();
        const { data } = await supabase
            .from('duty_logs')
            .select('member_id')
            .gte('sign_in_time', monday.toISOString())
            .eq('location_verified', true);

        if (data) {
            setSignedMemberIds(new Set(data.map(d => d.member_id)));
        }
        setLoading(false);
    }, [supabase]);

    useEffect(() => {
        fetchSignIns();
        // 每分钟刷新一次
        const timer = setInterval(fetchSignIns, 60_000);
        return () => clearInterval(timer);
    }, [fetchSignIns]);

    // 筛选：班次已结束 + 未签到的成员（去重）
    const absentMembers = React.useMemo(() => {
        const map = new Map<string, { name: string; slots: string[] }>();

        rosters.forEach(r => {
            if (!isPeriodPast(r.day_of_week, r.period)) return; // 班次还没结束，不算
            if (signedMemberIds.has(r.member_id)) return; // 已签到

            const existing = map.get(r.member_id);
            const slotLabel = `周${DAYS_LABEL[r.day_of_week - 1]}第${r.period}节`;
            if (existing) {
                existing.slots.push(slotLabel);
            } else {
                map.set(r.member_id, { name: r.member.name, slots: [slotLabel] });
            }
        });

        return Array.from(map.entries()).map(([id, info]) => ({ id, ...info }));
    }, [rosters, signedMemberIds]);

    if (loading) return null;

    return (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm mb-3">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="font-medium text-muted-foreground">本周未签到人员</span>
            </div>
            {absentMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">🎉 本周所有到期班次均已签到</p>
            ) : (
                <div className="space-y-1.5">
                    {absentMembers.map(m => (
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

// ===================================================================
// 组件 2: 目前在工作室的成员
// ===================================================================
interface StudioMembersCardProps {
    rosters: RosterWithMember[];
}

interface StudioMember {
    id: string;         // member_id
    sessionId: string;  // studio_sessions.id 或 duty_logs.id
    name: string;
    type: 'duty' | 'study';
    period: number;     // 0 = 非节次
}

export function StudioMembersCard({ rosters }: StudioMembersCardProps) {
    const supabase = createClient();
    const { user } = useUserStore();
    const [studioMembers, setStudioMembers] = useState<StudioMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [ending, setEnding] = useState(false);

    // 获取今日在工作室的成员（值班签到 + 自习，分开查询）
    const fetchStudioMembers = useCallback(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nowMin = getNowMinutes();
        const members: StudioMember[] = [];
        const seenIds = new Set<string>();

        // --- 数据源 1: 值班签到（duty_logs，排除 self-study 标记的旧数据） ---
        const { data: dutyLogs } = await supabase
            .from('duty_logs')
            .select('id, member_id, sign_in_time, device_info')
            .gte('sign_in_time', today.toISOString())
            .eq('location_verified', true);

        if (dutyLogs) {
            dutyLogs.forEach(log => {
                if (seenIds.has(log.member_id)) return;
                // 跳过误用 duty_logs 的自习记录
                if (log.device_info?.includes('self-study')) return;

                const signTime = new Date(log.sign_in_time);
                const signMin = signTime.getHours() * 60 + signTime.getMinutes();

                let matchedPeriod = 0;
                for (const [pid, range] of Object.entries(PERIOD_RANGES)) {
                    const startMin = range.start[0] * 60 + range.start[1] - 30;
                    const endMin = range.end[0] * 60 + range.end[1];
                    if (signMin >= startMin && signMin <= endMin) {
                        matchedPeriod = parseInt(pid);
                        break;
                    }
                }
                if (matchedPeriod === 0) matchedPeriod = 1;

                // 节次结束 +10 分钟后移除
                const periodEndPlus10 = getPeriodEndPlusMinutes(matchedPeriod, 10);
                if (nowMin > periodEndPlus10) return;

                const roster = rosters.find(r => r.member_id === log.member_id);
                members.push({
                    id: log.member_id,
                    sessionId: log.id,
                    name: roster?.member.name || '成员',
                    type: 'duty',
                    period: matchedPeriod
                });
                seenIds.add(log.member_id);
            });
        }

        // --- 数据源 2: 自习会话（studio_sessions，仅 is_active=true） ---
        const { data: sessions } = await supabase
            .from('studio_sessions')
            .select('id, member_id, started_at')
            .eq('is_active', true);

        if (sessions) {
            sessions.forEach(s => {
                if (seenIds.has(s.member_id)) return;

                // 推断自习开始时对应的节次
                const startTime = new Date(s.started_at);
                const startMin = startTime.getHours() * 60 + startTime.getMinutes();

                let matchedPeriod = 0;
                for (const [pid, range] of Object.entries(PERIOD_RANGES)) {
                    const sMin = range.start[0] * 60 + range.start[1] - 30;
                    const eMin = range.end[0] * 60 + range.end[1];
                    if (startMin >= sMin && startMin <= eMin) {
                        matchedPeriod = parseInt(pid);
                        break;
                    }
                }

                // 在节次内自习：+10 分钟后自动移除
                if (matchedPeriod > 0) {
                    const periodEndPlus10 = getPeriodEndPlusMinutes(matchedPeriod, 10);
                    if (nowMin > periodEndPlus10) {
                        // 自动结束该自习
                        supabase.from('studio_sessions')
                            .update({ is_active: false, ended_at: new Date().toISOString() })
                            .eq('id', s.id).then();
                        return;
                    }
                }

                const roster = rosters.find(r => r.member_id === s.member_id);
                members.push({
                    id: s.member_id,
                    sessionId: s.id,
                    name: roster?.member.name || '成员',
                    type: 'study',
                    period: matchedPeriod
                });
                seenIds.add(s.member_id);
            });
        }

        setStudioMembers(members);
        setLoading(false);
    }, [supabase, rosters]);

    useEffect(() => {
        fetchStudioMembers();
        const timer = setInterval(fetchStudioMembers, 30_000);
        return () => clearInterval(timer);
    }, [fetchStudioMembers]);

    // 开始自习 → 写入 studio_sessions
    const handleSelfStudy = async () => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('studio_sessions')
                .insert({ member_id: user.id });
            if (error) throw error;
            fetchStudioMembers();
        } catch (err) {
            console.error('自习签到失败:', err);
        }
    };

    // 结束自习 → UPDATE studio_sessions set is_active=false
    const handleEndStudy = async () => {
        if (!user) return;
        setEnding(true);
        try {
            const mySession = studioMembers.find(m => m.id === user.id && m.type === 'study');
            if (mySession) {
                const { error } = await supabase
                    .from('studio_sessions')
                    .update({ is_active: false, ended_at: new Date().toISOString() })
                    .eq('id', mySession.sessionId);
                if (error) throw error;
            }
            fetchStudioMembers();
        } catch (err) {
            console.error('结束自习失败:', err);
        } finally {
            setEnding(false);
        }
    };

    const isAlreadyInStudio = studioMembers.some(m => m.id === user?.id);
    const isSelfStudying = studioMembers.some(m => m.id === user?.id && m.type === 'study');

    if (loading) return null;

    return (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="font-medium text-muted-foreground">目前在工作室</span>
                    {studioMembers.length > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                            {studioMembers.length}人
                        </span>
                    )}
                </div>
            </div>

            {studioMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">目前工作室暂无人员</p>
            ) : (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {studioMembers.map(m => (
                        <span
                            key={m.id}
                            className={cn(
                                "inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ring-1 ring-inset",
                                m.type === 'study'
                                    ? "bg-purple-100 text-purple-700 ring-purple-300/50 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-700/50"
                                    : "bg-green-100 text-green-700 ring-green-300/50 dark:bg-green-950/30 dark:text-green-400 dark:ring-green-700/50"
                            )}
                        >
                            {m.name}
                            <span className="text-[9px] opacity-70 ml-1">
                                {m.type === 'study' ? '自习' : '值班'}
                            </span>
                        </span>
                    ))}
                </div>
            )}

            {/* 自习加入 / 结束自习 */}
            {!isAlreadyInStudio ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={handleSelfStudy}
                >
                    <BookOpen className="w-3 h-3 mr-1" />
                    我在工作室自习
                </Button>
            ) : isSelfStudying ? (
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
