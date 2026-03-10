'use client';

import { useDuty, RosterWithMember } from '@/hooks/useDuty';
import { DutyTable, SimpleMember } from '@/components/duty/DutyTable';
import { SignInCard } from '@/components/duty/SignInCard';
import { SwapModal } from '@/components/duty/SwapModal';
import { LeaveModal } from '@/components/duty/LeaveModal';
import { KeyTransferCard } from '@/components/duty/KeyTransferCard';
import { AbsentMembersCard, StudioMembersCard } from '@/components/duty/AttendancePanels';
import { useUserStore, ADMIN_ROLES } from '@/store/useUserStore';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, KeyRound } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import React from 'react';

interface DutyClientProps {
    initialData: RosterWithMember[];
    initialMembers: SimpleMember[];
}

export default function DutyClient({ initialData, initialMembers }: DutyClientProps) {
    const dutyManager = useDuty(initialData);
    const {
        rosters,
        leaves,
        approvedSwaps,
        isPending,
        isSigningIn,
        toggleDutySlot,
        toggleKey,
        performSignIn,
        refreshRosters,
        refreshLeaves,
        refreshApprovedSwaps
    } = dutyManager;

    const { user } = useUserStore();
    const supabase = React.useMemo(() => createClient(), []);
    const [hasSignedInToday, setHasSignedInToday] = useState(false);
    const [checkingSignIn, setCheckingSignIn] = useState(true);

    // 判断当前用户是否为管理员
    const isAdmin = ADMIN_ROLES.includes(user?.role || '');

    // 检查今天是否已签到
    useEffect(() => {
        async function checkTodaySignIn() {
            if (!user) {
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

                if (!error && data && data.length > 0) {
                    setHasSignedInToday(true);
                }
            } catch (e) {
                console.error('检查签到状态失败:', e);
            } finally {
                setCheckingSignIn(false);
            }
        }
        checkTodaySignIn();
    }, [user, isSigningIn, supabase]);

    // 初始化加载请假和已批准代班数据
    useEffect(() => {
        refreshLeaves();
        refreshApprovedSwaps();
    }, [refreshLeaves, refreshApprovedSwaps]);

    return (
        <div className="flex flex-col space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">值班与考勤大厅</h2>
                    <p className="text-muted-foreground mt-2">
                        {isAdmin
                            ? <>管理员模式：点击排班单元格下方的 <span className="text-primary font-medium">「指派成员」</span> 按钮来安排值班，点击成员标签旁的 <span className="text-destructive font-medium">✕</span> 移除排班。</>
                            : '查看当前排班安排，在指定时间内完成地理位置打卡。'
                        }
                    </p>
                </div>

                <Button
                    variant="outline"
                    onClick={refreshRosters}
                    disabled={isPending}
                    className="shrink-0"
                >
                    {isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    刷新排班
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
                {/* 左侧：打卡、换班、请假、钥匙交接 */}
                <div className="lg:col-span-1 space-y-6">
                    {(() => {
                        // 计算签到禁用原因
                        const now = new Date();
                        const todayDow = now.getDay();
                        const nowMin = now.getHours() * 60 + now.getMinutes();
                        const periodRanges: Record<number, [number, number]> = {
                            1: [8 * 60, 9 * 60 + 35],
                            2: [10 * 60 + 5, 11 * 60 + 40],
                            3: [13 * 60 + 30, 15 * 60 + 5],
                            4: [15 * 60 + 35, 17 * 60 + 10],
                        };

                        // 1. 是否在任何班次时间段内
                        let isInAnyPeriod = false;
                        if (todayDow >= 1 && todayDow <= 5) {
                            for (const [, [start, end]] of Object.entries(periodRanges)) {
                                if (nowMin >= start && nowMin <= end) {
                                    isInAnyPeriod = true;
                                    break;
                                }
                            }
                        }

                        // 2. 用户是否被安排在当前班次
                        const isAssigned = user ? rosters.some(r => {
                            if (r.member_id !== user.id) return false;
                            if (r.day_of_week !== todayDow) return false;
                            const [start, end] = periodRanges[r.period] || [0, 0];
                            return nowMin >= start && nowMin <= end;
                        }) : false;

                        const canSignIn = isInAnyPeriod && isAssigned;
                        const reason = !isInAnyPeriod ? 'not_in_period' as const
                            : !isAssigned ? 'not_assigned' as const
                                : null;

                        return (
                            <SignInCard
                                onSignIn={performSignIn}
                                isSigningIn={isSigningIn || checkingSignIn}
                                hasSignedInToday={hasSignedInToday}
                                isInDutyPeriod={canSignIn}
                                disabledReason={reason}
                            />
                        );
                    })()}

                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <h3 className="font-semibold text-lg border-b border-border pb-3 mb-4">换班与代理大厅</h3>
                        <p className="text-sm text-balance text-muted-foreground mb-4">
                            有临时的会议或请假？可以在这里发起换班请求给指定干事，或投放至公共代班池。
                        </p>
                        <div className="space-y-2">
                            <SwapModal dutyManager={dutyManager} />
                            <LeaveModal dutyManager={dutyManager} />
                        </div>
                    </div>

                    <KeyTransferCard dutyManager={dutyManager} allMembers={initialMembers} />
                </div>

                {/* 右侧：课表级可视化 5x4 大表格 + 钥匙持有者 */}
                <div className="lg:col-span-3 min-w-0 overflow-hidden space-y-4">
                    <DutyTable
                        rosters={rosters}
                        currentUserId={user?.id}
                        isAdmin={isAdmin}
                        allMembers={initialMembers}
                        leaves={leaves}
                        approvedSwaps={approvedSwaps}
                        onAssignMember={toggleDutySlot}
                        onRemoveMember={toggleDutySlot}
                        onToggleKey={toggleKey}
                        isPending={isPending}
                    />

                    {/* 钥匙持有者摘要 */}
                    <KeyHoldersSummary rosters={rosters} />

                    {/* 本周未签到人员 */}
                    <AbsentMembersCard rosters={rosters} />

                    {/* 目前在工作室的成员 */}
                    <StudioMembersCard rosters={rosters} />
                </div>
            </div>
        </div>
    );
}

// 钥匙持有者摘要组件
function KeyHoldersSummary({ rosters }: { rosters: RosterWithMember[] }) {
    // 从排班记录中去重提取持有钥匙的成员
    const keyHolders = React.useMemo(() => {
        const map = new Map<string, string>();
        rosters.forEach(r => {
            if (r.has_key && !map.has(r.member_id)) {
                map.set(r.member_id, r.member.name);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [rosters]);

    return (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm">
                <KeyRound className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="font-medium text-muted-foreground">当前钥匙持有者：</span>
                {keyHolders.length === 0 ? (
                    <span className="text-muted-foreground">暂无</span>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {keyHolders.map(h => (
                            <span
                                key={h.id}
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-inset ring-amber-300/50 dark:ring-amber-700/50"
                            >
                                <KeyRound className="w-3 h-3 mr-1" />
                                {h.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

