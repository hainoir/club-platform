import React from 'react';
import { RosterWithMember } from '@/hooks/useDuty';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const PERIODS = [
    { id: 1, label: '第一大节', time: '(8:00-9:35)' },
    { id: 2, label: '第二大节', time: '(10:05-11:40)' },
    { id: 3, label: '第三大节', time: '(13:30-15:05)' },
    { id: 4, label: '第四大节', time: '(15:35-17:10)' }
];

const DAYS = [
    { id: 1, label: '周一' },
    { id: 2, label: '周二' },
    { id: 3, label: '周三' },
    { id: 4, label: '周四' },
    { id: 5, label: '周五' }
];

interface DutyTableProps {
    rosters: RosterWithMember[];
    currentUserId?: string;
    onToggleSlot: (day: number, period: number) => void;
    isPending?: boolean;
}

export function DutyTable({ rosters, currentUserId, onToggleSlot, isPending }: DutyTableProps) {
    // 按照 [day][period] 的二维矩阵预处理数据
    const rosterMap = React.useMemo(() => {
        const map: Record<number, Record<number, RosterWithMember[]>> = {};
        DAYS.forEach(d => {
            map[d.id] = {};
            PERIODS.forEach(p => {
                map[d.id][p.id] = rosters.filter(r => r.day_of_week === d.id && r.period === p.id);
            });
        });
        return map;
    }, [rosters]);

    return (
        <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                    <tr>
                        <th className="border-b border-border bg-muted/40 p-4 font-semibold text-muted-foreground w-1/6">
                            时间 \ 星期
                        </th>
                        {DAYS.map(day => (
                            <th key={day.id} className="border-b border-l border-border bg-muted/20 p-4 font-semibold text-center w-[16.66%]">
                                {day.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {PERIODS.map(period => (
                        <tr key={period.id} className="group transition-colors hover:bg-muted/5">
                            <td className="border-b border-border p-4 text-center">
                                <div className="font-medium">{period.label}</div>
                                <div className="text-xs text-muted-foreground mt-1">{period.time}</div>
                            </td>
                            {DAYS.map(day => {
                                const membersInSlot = rosterMap[day.id][period.id] || [];
                                const isCurrentUserInSlot = membersInSlot.some(m => m.member_id === currentUserId);

                                return (
                                    <td
                                        key={`${day.id}-${period.id}`}
                                        className={cn(
                                            "border-b border-l border-border p-3 align-top transition-colors relative min-h-[100px]",
                                            isCurrentUserInSlot ? "bg-primary/5" : ""
                                        )}
                                    >
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {membersInSlot.map(record => (
                                                <div
                                                    key={record.id}
                                                    className={cn(
                                                        "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ring-1 ring-inset",
                                                        record.member_id === currentUserId
                                                            ? "bg-primary/10 text-primary ring-primary/20"
                                                            : "bg-secondary text-secondary-foreground ring-border"
                                                    )}
                                                >
                                                    {record.member.name}
                                                </div>
                                            ))}
                                        </div>

                                        {/* 操作区：自己在这个时段，显示取消；如果不在，且登录了，显示报名虚线框 */}
                                        {currentUserId && (
                                            <div className="mt-auto pt-2">
                                                {isCurrentUserInSlot ? (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onToggleSlot(day.id, period.id)}
                                                        disabled={isPending}
                                                        className="w-full h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    >
                                                        取消排班
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => onToggleSlot(day.id, period.id)}
                                                        disabled={isPending}
                                                        className="w-full h-7 text-xs border-dashed text-muted-foreground hover:border-primary hover:text-primary"
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" />
                                                        报名该岗
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
