'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, KeyRound } from 'lucide-react';

import { AbsentMembersCard, StudioMembersCard } from '@/components/duty/AttendancePanels';
import { DutyTable, SimpleMember } from '@/components/duty/DutyTable';
import { KeyTransferCard } from '@/components/duty/KeyTransferCard';
import { LeaveModal } from '@/components/duty/LeaveModal';
import { SignInCard } from '@/components/duty/SignInCard';
import { SwapModal } from '@/components/duty/SwapModal';
import { Button } from '@/components/ui/button';
import { useDuty, RosterWithMember } from '@/hooks/useDuty';
import { resolveCurrentDutyAvailability } from '@/lib/duty-sign-in';
import { filterRostersForDutyAvailability } from '@/lib/duty-leaves';
import { isAdminRole, useUserStore } from '@/store/useUserStore';
import { createClient } from '@/utils/supabase/client';

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
        isSigningIn,
        toggleDutySlot,
        toggleKey,
        performSignIn,
        refreshRosters,
        refreshApprovedLeaves,
        refreshPendingLeaves,
        refreshApprovedSwaps,
    } = dutyManager;

    const { user } = useUserStore();
    const supabase = React.useMemo(() => createClient(), []);
    const [hasSignedInToday, setHasSignedInToday] = useState(false);
    const [checkingSignIn, setCheckingSignIn] = useState(true);

    const isAdmin = isAdminRole(user?.role);

    const activeRosters = React.useMemo(
        () => filterRostersForDutyAvailability(rosters, approvedLeaves),
        [rosters, approvedLeaves]
    );

    useEffect(() => {
        async function checkTodaySignIn() {
            setCheckingSignIn(true);

            if (!user) {
                setHasSignedInToday(false);
                setCheckingSignIn(false);
                return;
            }

            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const { data, error } = await supabase
                    .from('duty_logs')
                    .select('id')
                    .eq('member_id', user.id)
                    .gte('sign_in_time', today.toISOString())
                    .limit(1);

                setHasSignedInToday(!error && !!data && data.length > 0);
            } catch (e) {
                console.error('Failed to check sign-in status:', e);
                setHasSignedInToday(false);
            } finally {
                setCheckingSignIn(false);
            }
        }

        checkTodaySignIn();
    }, [user, isSigningIn, supabase]);

    useEffect(() => {
        refreshApprovedLeaves();
        refreshPendingLeaves();
        refreshApprovedSwaps();
    }, [refreshApprovedLeaves, refreshPendingLeaves, refreshApprovedSwaps]);

    return (
        <div className="flex flex-col space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">值班与考勤大厅</h2>
                    <p className="mt-2 text-muted-foreground">
                        {isAdmin ? (
                            <>
                                管理员模式：点击排班单元格下方的 <span className="text-primary font-medium">“指派成员”</span> 按钮来安排值班，
                                点击成员标签旁的 <span className="text-destructive font-medium">✕</span> 移除排班。
                            </>
                        ) : (
                            '查看当前排班安排，并在指定时间内完成地理位置签到。'
                        )}
                    </p>
                </div>

                <Button variant="outline" onClick={refreshRosters} disabled={isPending} className="shrink-0">
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    刷新排班
                </Button>
            </div>

            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-4">
                <div className="space-y-6 lg:col-span-1">
                    {(() => {
                        const now = new Date();
                        const todayDow = now.getDay();
                        const todayAssignedPeriods = user
                            ? Array.from(new Set(activeRosters.filter((r) => r.member_id === user.id && r.day_of_week === todayDow).map((r) => r.period)))
                            : [];
                        const availability = resolveCurrentDutyAvailability(todayAssignedPeriods, now);

                        return (
                            <SignInCard
                                onSignIn={performSignIn}
                                isSigningIn={isSigningIn}
                                hasSignedInToday={hasSignedInToday}
                                isInDutyPeriod={availability.canSignInNow}
                                disabledReason={availability.disabledReason}
                            />
                        );
                    })()}

                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <h3 className="mb-4 border-b border-border pb-3 text-lg font-semibold">换班与代理大厅</h3>
                        <p className="mb-4 text-sm text-balance text-muted-foreground">
                            有临时会议或请假时，可以在这里向指定成员发起换班请求，或者投放到公共代班池。
                        </p>
                        <div className="space-y-2">
                            <SwapModal dutyManager={dutyManager} />
                            <LeaveModal dutyManager={dutyManager} allMembers={initialMembers} />
                        </div>
                    </div>

                    <KeyTransferCard dutyManager={dutyManager} allMembers={initialMembers} />
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

                    <KeyHoldersSummary rosters={rosters} />
                    <AbsentMembersCard rosters={activeRosters} />
                    <StudioMembersCard rosters={activeRosters} />
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
