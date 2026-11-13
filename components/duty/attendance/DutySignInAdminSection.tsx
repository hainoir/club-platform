'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AbsentMembersCard } from './AbsentMembersCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDutySignInAdmin, type AdminDutyLog } from '@/hooks/duty/useDutySignInAdmin';
import type { RosterWithMember } from '@/hooks/useDuty';
import { isDutyRequiredDate } from '@/lib/duty/china-public-holidays';
import { DUTY_PERIODS } from '@/lib/duty/duty-constants';
import { getDayOfWeekFromDateKey, getDutyPeriodByMinutes, toDutyDateTimeParts } from '@/lib/duty/duty-time';
import { isAdminRole, useUserStore } from '@/store/useUserStore';

export interface BackfillSlot {
    memberId: string;
    dateKey: string;
    period: number;
}

const shanghaiTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function formatTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : shanghaiTime.format(date);
}

function parseShanghaiInstant(dateKey: string, time: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const instant = new Date(`${dateKey}T${time}:00+08:00`);
    if (Number.isNaN(instant.getTime())) return null;
    const parts = toDutyDateTimeParts(instant);
    return parts.dateKey === dateKey && parts.hour === Number(time.slice(0, 2)) && parts.minute === Number(time.slice(3))
        ? instant : null;
}

function getBackfillError(rosters: RosterWithMember[], logs: AdminDutyLog[], memberId: string, dateKey: string, time: string): string | null {
    if (!memberId || !dateKey || !time) return '请选择成员、日期和时间。';
    const instant = parseShanghaiInstant(dateKey, time);
    if (!instant) return '补签日期或时间无效。';
    if (instant.getTime() > Date.now()) return '补签时间不能晚于当前时间。';
    if (!isDutyRequiredDate(dateKey)) return '公共假日无需值班，不能补签。';
    const period = getDutyPeriodByMinutes(toDutyDateTimeParts(instant).minutes);
    if (!period) return '补签时间需落在值班节次窗口内。';
    if (!rosters.some((roster) => roster.member_id === memberId && roster.day_of_week === getDayOfWeekFromDateKey(dateKey) && roster.period === period)) {
        return '该成员在所选日期和节次没有排班。';
    }
    if (logs.some((log) => log.member_id === memberId && toDutyDateTimeParts(log.sign_in_time).dateKey === dateKey)) {
        return '该成员在所选上海日期已有签到记录。';
    }
    return null;
}

export function DutySignInAdminSection({ rosters, absentRosters }: { rosters: RosterWithMember[]; absentRosters: RosterWithMember[] }) {
    const router = useRouter();
    const { user } = useUserStore();
    const isAdmin = isAdminRole(user?.role);
    const [refreshKey, setRefreshKey] = useState(0);
    const [slot, setSlot] = useState<BackfillSlot | null>(null);
    const onChanged = useCallback(() => {
        setRefreshKey((value) => value + 1);
        router.refresh();
    }, [router]);

    return (
        <div className="space-y-4">
            <AbsentMembersCard rosters={absentRosters} refreshKey={refreshKey} onBackfill={isAdmin ? setSlot : undefined} />
            {isAdmin ? <DutySignInAdminCard rosters={rosters} slot={slot} onChanged={onChanged} /> : null}
        </div>
    );
}

function DutySignInAdminCard({ rosters, slot, onChanged }: {
    rosters: RosterWithMember[];
    slot: BackfillSlot | null;
    onChanged: () => void;
}) {
    const { logs, hasMoreLogs, loadMoreLogs, events, loading, saving, errorMessage, setErrorMessage, load, run } = useDutySignInAdmin(onChanged);
    const [memberId, setMemberId] = useState('');
    const [dateKey, setDateKey] = useState('');
    const [time, setTime] = useState('');
    const [reason, setReason] = useState('');
    const [selectedLog, setSelectedLog] = useState<{ log: AdminDutyLog; action: 'invalid' | 'delete' } | null>(null);
    const [logReason, setLogReason] = useState('');
    const members = useMemo(() => Array.from(new Map(rosters.map((roster) => [roster.member_id, roster.member.name])).entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'zh-CN')), [rosters]);
    const memberNames = useMemo(() => new Map(members), [members]);

    useEffect(() => {
        if (!slot) return;
        setMemberId(slot.memberId);
        setDateKey(slot.dateKey);
        const period = DUTY_PERIODS.find((entry) => entry.id === slot.period);
        setTime(period?.start ?? '');
        setErrorMessage(null);
    }, [setErrorMessage, slot]);

    const submitBackfill = async () => {
        const trimmedReason = reason.trim();
        if (trimmedReason.length < 1 || trimmedReason.length > 200) {
            setErrorMessage('原因需为 1 到 200 字。');
            return;
        }
        const validationError = getBackfillError(rosters, logs, memberId, dateKey, time);
        if (validationError) {
            setErrorMessage(validationError);
            return;
        }
        const instant = parseShanghaiInstant(dateKey, time);
        if (!instant) return;
        if (await run('backfill', { memberId, signInTime: instant.toISOString(), reason: trimmedReason })) setReason('');
    };

    const submitLogAction = async () => {
        if (!selectedLog) return;
        if (await run(selectedLog.action, { logId: selectedLog.log.id, reason: logReason })) {
            setSelectedLog(null);
            setLogReason('');
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">签到管理</CardTitle>
                <CardDescription>管理员补签、作废或删除签到。所有操作都需要填写原因并写入审计记录。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitBackfill(); }}>
                    <h3 className="text-sm font-medium">补签值班</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1"><Label htmlFor="backfill-member">成员</Label>
                            <select id="backfill-member" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={memberId} onChange={(event) => setMemberId(event.target.value)} disabled={saving}>
                                <option value="">选择成员</option>
                                {members.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1"><Label htmlFor="backfill-date">日期（上海）</Label><Input id="backfill-date" type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} disabled={saving} /></div>
                        <div className="space-y-1"><Label htmlFor="backfill-time">时间（上海）</Label><Input id="backfill-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} disabled={saving} /></div>
                    </div>
                    <div className="space-y-1"><Label htmlFor="backfill-reason">补签原因</Label><Input id="backfill-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} placeholder="请填写 1 到 200 字" /></div>
                    <Button type="submit" disabled={saving}>确认补签</Button>
                </form>

                <div className="space-y-2">
                    <div className="flex items-center justify-between"><h3 className="text-sm font-medium">最近签到记录</h3><Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading || saving}>刷新</Button></div>
                    {loading ? <p className="text-sm text-muted-foreground">读取中...</p> : logs.length === 0 ? <p className="text-sm text-muted-foreground">暂无签到记录。</p> : (
                        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
                            {logs.map((log) => <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                                <span>{memberNames.get(log.member_id) ?? log.member_id} · {formatTime(log.sign_in_time)} · {log.location_verified ? '已核验' : '无效'}</span>
                                <span className="flex gap-2">
                                    {log.location_verified ? <Button type="button" size="sm" variant="outline" onClick={() => { setSelectedLog({ log, action: 'invalid' }); setLogReason(''); setErrorMessage(null); }}>标为无效</Button> : null}
                                    <Button type="button" size="sm" variant="outline" onClick={() => { setSelectedLog({ log, action: 'delete' }); setLogReason(''); setErrorMessage(null); }}>删除</Button>
                                </span>
                            </li>)}
                        </ul>
                    )}
                    {hasMoreLogs ? <Button type="button" variant="outline" size="sm" onClick={loadMoreLogs} disabled={loading || saving}>加载更早记录</Button> : null}
                    {selectedLog ? <form className="space-y-2 rounded-md border p-3" onSubmit={(event) => { event.preventDefault(); void submitLogAction(); }}>
                        <p className="text-sm font-medium">{selectedLog.action === 'invalid' ? '标为无效' : '删除'}：{memberNames.get(selectedLog.log.member_id) ?? selectedLog.log.member_id} · {formatTime(selectedLog.log.sign_in_time)}</p>
                        <Label htmlFor="log-action-reason">操作原因</Label>
                        <Input id="log-action-reason" value={logReason} onChange={(event) => setLogReason(event.target.value)} disabled={saving} placeholder="请填写 1 到 200 字" />
                        <div className="flex gap-2"><Button type="submit" disabled={saving}>确认{selectedLog.action === 'invalid' ? '作废' : '删除'}</Button><Button type="button" variant="outline" onClick={() => setSelectedLog(null)} disabled={saving}>取消</Button></div>
                    </form> : null}
                </div>

                {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
                <div className="space-y-2">
                    <h3 className="text-sm font-medium">最近管理记录</h3>
                    {events.length === 0 ? <p className="text-sm text-muted-foreground">还没有签到管理记录。</p> : <ul className="space-y-2 text-sm">{events.map((event) => <li key={event.id} className="rounded-md border p-2"><p>{event.reason}</p><p className="text-muted-foreground">{formatTime(event.created_at)} · {event.action} · {memberNames.get(event.target_member_id ?? '') ?? event.target_member_id ?? '未知成员'}{event.sign_in_time ? ` · 签到 ${formatTime(event.sign_in_time)}` : ''}</p></li>)}</ul>}
                </div>
            </CardContent>
        </Card>
    );
}
