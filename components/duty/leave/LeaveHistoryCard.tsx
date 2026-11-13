'use client';

import { History } from 'lucide-react';

import { useDutyLeaveHistory } from '@/hooks/duty/useDutyLeaveHistory';
import { useSupabase } from '@/hooks/shared/useSupabase';
import { useUserStore } from '@/store/useUserStore';

import { formatDutySlot } from './leave-modal-utils';

export function LeaveHistoryCard({ refreshKey }: { refreshKey?: string }) {
    const { user } = useUserStore();
    const supabase = useSupabase();
    const { rows, loading, error } = useDutyLeaveHistory(supabase, user, refreshKey);

    const now = Date.now();
    const sortedRows = [...rows].sort((a, b) => {
        const aUpcoming = Date.parse(a.expires_at) > now;
        const bUpcoming = Date.parse(b.expires_at) > now;
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        return Date.parse(b.created_at) - Date.parse(a.created_at);
    });

    return (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-label="请假记录">
            <h3 className="mb-4 flex items-center border-b border-border pb-3 text-lg font-semibold">
                <History className="mr-2 h-5 w-5 text-primary" />
                请假记录
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">最多显示 100 条，未过期记录在前。</p>

            {loading ? (
                <p className="text-sm text-muted-foreground">正在加载请假记录…</p>
            ) : error ? (
                <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : sortedRows.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">暂无请假记录。</p>
            ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto">
                    {sortedRows.map((leave) => (
                        <li key={leave.id} className="rounded-md border px-3 py-3 text-sm">
                            <div className="flex flex-wrap items-start justify-between gap-1">
                                <p className="font-medium">{leave.member?.name || '成员'} · {leave.leave_date}</p>
                                <span className="text-xs text-muted-foreground">
                                    {leave.status === 'approved' ? '已批准' : '待审批'}
                                </span>
                            </div>
                            <p className="text-muted-foreground">{formatDutySlot(leave.day_of_week, leave.period)}</p>
                            {leave.reason && <p className="mt-1 text-xs text-muted-foreground">原因：{leave.reason}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">补班 {leave.penalty_shifts} 节</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
