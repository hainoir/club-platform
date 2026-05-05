'use client';

import React, { useEffect } from 'react';
import { Loader2, RefreshCw, KeyRound } from 'lucide-react';

import { StudioMembersCard } from '@/components/duty/attendance/AttendancePanels';
import { DutyTable, SimpleMember } from '@/components/duty/roster/DutyTable';
import { LeaveModal } from '@/components/duty/leave/LeaveModal';
import { SwapModal } from '@/components/duty/swaps/SwapModal';
import { Button } from '@/components/ui/button';
import { useDuty, RosterWithMember } from '@/hooks/useDuty';
import { filterRostersForDutyAvailability } from '@/lib/duty/duty-leaves';
import { isAdminRole, useUserStore } from '@/store/useUserStore';

interface DutyClientProps {
    initialData: RosterWithMember[];
    initialMembers: SimpleMember[];
}

export default function DutyClient({ initialData, initialMembers }: DutyClientProps) {
    const dutyManager = useDuty(initialData);
    const {
        rosters,
        approvedLeaves,
        approvedSwaps,
        isPending,
        toggleDutySlot,
        toggleKey,
        refreshRosters,
        refreshApprovedLeaves,
        refreshPendingLeaves,
        refreshApprovedSwaps,
    } = dutyManager;

    const { user } = useUserStore();
    const isAdmin = isAdminRole(user?.role);

    const activeRosters = React.useMemo(
        () => filterRostersForDutyAvailability(rosters, approvedLeaves),
        [rosters, approvedLeaves]
    );

    useEffect(() => {
        refreshApprovedLeaves();
        refreshPendingLeaves();
        refreshApprovedSwaps();
    }, [refreshApprovedLeaves, refreshPendingLeaves, refreshApprovedSwaps]);

    return (
        <div className="flex flex-col space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">值班管理</h2>
                    <p className="mt-2 text-muted-foreground">
                        {isAdmin
                            ? '管理员可在这里维护排班、标记钥匙持有人，并处理请假与代班审批。'
                            : '普通成员可查看排班；排班、钥匙和审批操作仅管理员可用。'}
                    </p>
                </div>

                <Button variant="outline" onClick={refreshRosters} disabled={isPending} className="shrink-0">
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    刷新排班
                </Button>
            </div>

            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-4">
                <div className="space-y-6 lg:col-span-1">
                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <h3 className="mb-4 border-b border-border pb-3 text-lg font-semibold">审批处理</h3>
                        <p className="mb-4 text-sm text-balance text-muted-foreground">
                            请假和代班审批集中在这里处理；成员侧发起与响应入口已放到首页。
                        </p>
                        <div className="space-y-2">
                            <SwapModal dutyManager={dutyManager} mode="admin" />
                            <LeaveModal dutyManager={dutyManager} allMembers={initialMembers} mode="admin" />
                        </div>
                    </div>

                    <KeyHoldersSummary rosters={rosters} />
                    <StudioMembersCard rosters={activeRosters} allowSelfStudy={false} />
                </div>

                <div className="min-w-0 space-y-4 overflow-hidden lg:col-span-3">
                    <DutyTable
                        rosters={rosters}
                        currentUserId={user?.id}
                        isAdmin={isAdmin}
                        allMembers={initialMembers}
                        approvedLeaves={approvedLeaves}
                        approvedSwaps={approvedSwaps}
                        onAssignMember={toggleDutySlot}
                        onRemoveMember={toggleDutySlot}
                        onToggleKey={toggleKey}
                        isPending={isPending}
                    />
                </div>
            </div>
        </div>
    );
}

function KeyHoldersSummary({ rosters }: { rosters: RosterWithMember[] }) {
    const keyHolders = React.useMemo(() => {
        const map = new Map<string, string>();
        rosters.forEach((r) => {
            if (r.has_key && !map.has(r.member_id)) {
                map.set(r.member_id, r.member.name);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [rosters]);

    return (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="font-medium text-muted-foreground">当前钥匙持有者：</span>
                {keyHolders.length === 0 ? (
                    <span className="text-muted-foreground">暂无</span>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {keyHolders.map((holder) => (
                            <span
                                key={holder.id}
                                className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-300/50 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700/50"
                            >
                                <KeyRound className="mr-1 h-3 w-3" />
                                {holder.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
