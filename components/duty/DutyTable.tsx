import React, { useState, useMemo } from 'react';
import { RosterWithMember, SwapWithMember } from '@/hooks/useDuty';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X, UserPlus, ChevronDown, Search, KeyRound } from 'lucide-react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

// 简易成员类型（从成员表选取的字段）
export interface SimpleMember {
    id: string;
    name: string;
    student_id: string | number | null;
}

const PERIODS = [
    { id: 1, label: '第一大节', time: '(8:00-9:35)' },
    { id: 2, label: '第二大节', time: '(10:05-11:40)' },
    { id: 3, label: '第三大节', time: '(13:30-15:05)' },
    { id: 4, label: '第四大节', time: '(15:35-17:10)' }
];

// 每节课的结束时间（小时, 分钟）
const PERIOD_END_TIMES: Record<number, [number, number]> = {
    1: [9, 35],
    2: [11, 40],
    3: [15, 5],
    4: [17, 10],
};

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
    isAdmin: boolean;
    allMembers: SimpleMember[];
    leaves?: any[];
    approvedSwaps?: SwapWithMember[];
    onAssignMember: (day: number, period: number, memberId: string, memberName: string) => void;
    onRemoveMember: (day: number, period: number, memberId: string, memberName: string) => void;
    onToggleKey?: (memberId: string, hasKey: boolean) => void;
    isPending?: boolean;
}

// ------------------------------------------------------------------
// 成员选择器浮层（管理员专用）
// ------------------------------------------------------------------
function MemberPickerPopover({
    allMembers,
    existingMemberIds,
    onSelect,
    isPending,
}: {
    allMembers: SimpleMember[];
    existingMemberIds: string[];
    onSelect: (member: SimpleMember) => void;
    isPending?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    // 过滤掉已在该时段的成员，并按搜索关键词过滤
    const available = allMembers.filter(
        m =>
            !existingMemberIds.includes(m.id) &&
            (m.name.toLowerCase().includes(search.toLowerCase()) ||
                (m.student_id !== null && m.student_id !== undefined && String(m.student_id).includes(search)))
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    className="w-full h-7 text-xs border-dashed text-muted-foreground hover:border-primary hover:text-primary"
                >
                    <UserPlus className="w-3 h-3 mr-1" />
                    指派成员
                    <ChevronDown className="w-3 h-3 ml-auto" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
                {/* 搜索框 */}
                <div className="relative mb-2">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="搜索姓名或学号..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-8 pl-7 text-xs"
                    />
                </div>
                {/* 成员列表 */}
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {available.length === 0 ? (
                        <p className="text-xs text-center text-muted-foreground py-3">
                            {search ? '未找到匹配成员' : '所有成员已在该时段'}
                        </p>
                    ) : (
                        available.map(member => (
                            <button
                                key={member.id}
                                onClick={() => {
                                    onSelect(member);
                                    setOpen(false);
                                    setSearch('');
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors flex items-center justify-between group"
                            >
                                <span className="font-medium">{member.name}</span>
                                {member.student_id && (
                                    <span className="text-muted-foreground text-[10px]">
                                        {member.student_id}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ------------------------------------------------------------------
// 主排班表格
// ------------------------------------------------------------------
export function DutyTable({
    rosters,
    currentUserId,
    isAdmin,
    allMembers,
    leaves = [],
    approvedSwaps = [],
    onAssignMember,
    onRemoveMember,
    onToggleKey,
    isPending,
}: DutyTableProps) {
    // 按照“星期 + 节次”的二维矩阵预处理数据
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

    // 获取某个成员在某个槽位的状态标签（请假/代班）
    // 节次结束后标签自动消失
    const getSlotLabel = useMemo(() => {
        const now = new Date();
        const todayDow = now.getDay(); // 0=周日, 1=周一, ..., 5=周五
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // 判断某个节次是否已结束（仅当今天是该星期时才考虑时间）
        const isPeriodOver = (day: number, period: number) => {
            if (todayDow !== day) return todayDow > day && todayDow <= 5;
            const [endH, endM] = PERIOD_END_TIMES[period] || [23, 59];
            return currentHour > endH || (currentHour === endH && currentMinute >= endM);
        };

        return (memberId: string, day: number, period: number): 'leave' | 'substitute' | null => {
            // 节次已结束，不显示标签
            if (isPeriodOver(day, period)) return null;

            // 检查请假
            const hasLeave = leaves.some(
                l => l.member_id === memberId && l.day_of_week === day && l.period === period
            );
            if (hasLeave) return 'leave';

            // 检查代班（已批准记录中目标成员是该成员）
            const isSubstitute = approvedSwaps.some(
                s => s.target_id === memberId && s.original_day === day && s.original_period === period
            );
            if (isSubstitute) return 'substitute';

            return null;
        };
    }, [leaves, approvedSwaps]);

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
                                const existingMemberIds = membersInSlot.map(m => m.member_id);

                                return (
                                    <td
                                        key={`${day.id}-${period.id}`}
                                        className={cn(
                                            "border-b border-l border-border p-3 align-top transition-colors relative min-h-[100px]",
                                            isCurrentUserInSlot ? "bg-primary/5" : ""
                                        )}
                                    >
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {membersInSlot.map(record => {
                                                const label = getSlotLabel(record.member_id, day.id, period.id);
                                                return (
                                                    <div
                                                        key={record.id}
                                                        className={cn(
                                                            "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ring-1 ring-inset gap-1",
                                                            label === 'leave'
                                                                ? "bg-orange-100 text-orange-700 ring-orange-300/50 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-700/50"
                                                                : label === 'substitute'
                                                                    ? "bg-green-100 text-green-700 ring-green-300/50 dark:bg-green-950/30 dark:text-green-400 dark:ring-green-700/50"
                                                                    : record.member_id === currentUserId
                                                                        ? "bg-primary/10 text-primary ring-primary/20"
                                                                        : "bg-secondary text-secondary-foreground ring-border"
                                                        )}
                                                    >
                                                        {record.member.name}
                                                        {label === 'leave' && (
                                                            <span className="text-[10px] opacity-80">(请假)</span>
                                                        )}
                                                        {label === 'substitute' && (
                                                            <span className="text-[10px] opacity-80">(代班)</span>
                                                        )}
                                                        {/* 钥匙标记 */}
                                                        {record.has_key && (
                                                            <KeyRound className="w-3 h-3 text-amber-500" />
                                                        )}
                                                        {/* 管理员可切换钥匙状态 */}
                                                        {isAdmin && !record.has_key && onToggleKey && (
                                                            <button
                                                                onClick={() => onToggleKey(record.member_id, true)}
                                                                className="ml-0.5 rounded-full p-0.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-amber-500 transition-all"
                                                                title={`标记 ${record.member.name} 持有钥匙`}
                                                            >
                                                                <KeyRound className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                        {isAdmin && record.has_key && onToggleKey && (
                                                            <button
                                                                onClick={() => onToggleKey(record.member_id, false)}
                                                                className="ml-0.5 rounded-full p-0.5 hover:bg-amber-200/50 hover:text-amber-700 transition-colors"
                                                                title={`取消 ${record.member.name} 的钥匙标记`}
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                        {/* 管理员可移除已排班成员 */}
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => onRemoveMember(day.id, period.id, record.member_id, record.member.name)}
                                                                disabled={isPending}
                                                                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                                                                title={`移除 ${record.member.name}`}
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* 管理员操作区：指派成员下拉选择器 */}
                                        {isAdmin && (
                                            <div className="mt-auto pt-2">
                                                <MemberPickerPopover
                                                    allMembers={allMembers}
                                                    existingMemberIds={existingMemberIds}
                                                    onSelect={(member) => onAssignMember(day.id, period.id, member.id, member.name)}
                                                    isPending={isPending}
                                                />
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
