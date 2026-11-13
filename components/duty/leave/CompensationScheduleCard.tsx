import { CalendarDays } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DUTY_PERIODS, DUTY_DAY_SHORT_LABELS } from '@/lib/duty/duty-constants';
import { getDutyNow, getDutyPeriodEndMinutes } from '@/lib/duty/duty-time';
import type { CompensationWithDetails } from '@/hooks/duty/useDutyCompensations';

interface CompensationScheduleCardProps {
    compensations: CompensationWithDetails[];
    isLoading: boolean;
    hasError: boolean;
}

function leaveStatusLabel(status?: string) {
    if (status === 'pending') return '请假待审批';
    if (status === 'approved') return '请假已批准';
    if (status === 'rejected') return '请假已拒绝';
    return status ? `请假状态：${status}` : null;
}

export function CompensationScheduleCard({ compensations, isLoading, hasError }: CompensationScheduleCardProps) {
    const now = getDutyNow();
    const isPast = (row: CompensationWithDetails) =>
        row.compensation_date < now.dateKey ||
        (row.compensation_date === now.dateKey && now.minutes >= getDutyPeriodEndMinutes(row.period));
    const bySlot = (a: CompensationWithDetails, b: CompensationWithDetails) =>
        a.compensation_date.localeCompare(b.compensation_date) || a.period - b.period || a.id.localeCompare(b.id);
    const upcoming = compensations.filter((row) => !isPast(row)).sort(bySlot);
    const past = compensations.filter(isPast).sort((a, b) => -bySlot(a, b));

    const renderRows = (rows: CompensationWithDetails[]) => rows.map((row) => {
        const status = leaveStatusLabel(row.leave?.status);
        const weekday = DUTY_DAY_SHORT_LABELS[row.day_of_week - 1];
        const period = DUTY_PERIODS.find((item) => item.id === row.period);

        return (
            <li key={row.id} className="rounded-lg border border-border/80 p-3 text-sm">
                <p className="font-medium">{row.member?.name || '未知成员'}</p>
                <p className="mt-1 text-muted-foreground">
                    {row.compensation_date} · {weekday ? `周${weekday}` : '星期未知'} · {period?.fullLabel || `第${row.period}大节`}
                </p>
                {status && <p className="mt-1 text-xs text-muted-foreground">{status}</p>}
            </li>
        );
    });

    return (
        <Card className="bg-card/60 shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarDays className="h-5 w-5 text-primary" />补班安排
                </CardTitle>
                <CardDescription>按具体日期查看补班计划。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoading ? <p className="text-sm text-muted-foreground">正在加载补班安排...</p> :
                    hasError ? <p className="text-sm text-destructive">补班安排加载失败，请刷新页面重试。</p> :
                        compensations.length === 0 ? <p className="text-sm text-muted-foreground">暂无补班安排。</p> : (
                            <>
                                {upcoming.length > 0 && <section aria-label="待补班">
                                    <h4 className="mb-2 text-sm font-medium">待补班</h4>
                                    <ul className="space-y-2">{renderRows(upcoming)}</ul>
                                </section>}
                                {past.length > 0 && <section aria-label="已过日期">
                                    <h4 className="mb-2 text-sm font-medium">已过日期</h4>
                                    <ul className="space-y-2">{renderRows(past)}</ul>
                                </section>}
                            </>
                        )}
            </CardContent>
        </Card>
    );
}
