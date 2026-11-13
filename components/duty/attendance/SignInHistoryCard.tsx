'use client';

import { ClipboardList } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDutySignInHistory } from '@/hooks/duty/useDutySignInHistory';
import { useSupabase } from '@/hooks/shared/useSupabase';
import { DUTY_TIME_ZONE, toDutyDateTimeParts } from '@/lib/duty/duty-time';
import { useUserStore } from '@/store/useUserStore';

function formatShanghaiTime(signInTime: string): string {
    const { hour, minute } = toDutyDateTimeParts(signInTime, DUTY_TIME_ZONE);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function SignInHistoryCard() {
    const supabase = useSupabase();
    const user = useUserStore((state) => state.user);
    const { rows, loading, error } = useDutySignInHistory(supabase, user);

    return (
        <Card className="bg-card/60 shadow-sm backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    签到记录
                </CardTitle>
                <CardDescription>近八周签到记录，按时间倒序显示，最多 50 条。</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-sm text-muted-foreground">签到记录加载中...</p>
                ) : error ? (
                    <p role="alert" className="text-sm text-destructive">{error}</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">近八周暂无签到记录。</p>
                ) : (
                    <ul className="divide-y divide-border/80">
                        {rows.map((row) => (
                            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="font-medium">{row.member?.name ?? '未知成员'}</span>
                                    <time dateTime={row.sign_in_time} className="text-muted-foreground">
                                        {row.sign_in_date} {formatShanghaiTime(row.sign_in_time)}
                                    </time>
                                </div>
                                <Badge variant="outline" className={row.location_verified
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-300 bg-amber-50 text-amber-700'}>
                                    {row.location_verified ? '已核验' : '未核验'}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
