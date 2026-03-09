'use client';

import { useDuty, RosterWithMember } from '@/hooks/useDuty';
import { DutyTable, SimpleMember } from '@/components/duty/DutyTable';
import { SignInCard } from '@/components/duty/SignInCard';
import { SwapModal } from '@/components/duty/SwapModal';
import { useUserStore, ADMIN_ROLES } from '@/store/useUserStore';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

interface DutyClientProps {
    initialData: RosterWithMember[];
    initialMembers: SimpleMember[];
}

export default function DutyClient({ initialData, initialMembers }: DutyClientProps) {
    const dutyManager = useDuty(initialData);
    const {
        rosters,
        isPending,
        isSigningIn,
        toggleDutySlot,
        performSignIn,
        refreshRosters
    } = dutyManager;

    const { user } = useUserStore();
    const supabase = createClient();
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
    }, [user, isSigningIn]);

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
                {/* 左侧：打卡机器与大厅操作区 */}
                <div className="lg:col-span-1 space-y-6">
                    <SignInCard
                        onSignIn={performSignIn}
                        isSigningIn={isSigningIn || checkingSignIn}
                        hasSignedInToday={hasSignedInToday}
                    />

                    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                        <h3 className="font-semibold text-lg border-b border-border pb-3 mb-4">换班与代理大厅</h3>
                        <p className="text-sm text-balance text-muted-foreground mb-4">
                            有临时的会议或请假？可以在这里发起换班请求给指定干事，或投放至公共代班池。
                        </p>
                        <SwapModal dutyManager={dutyManager} />
                    </div>
                </div>

                {/* 右侧：课表级可视化 5x4 大表格 */}
                <div className="lg:col-span-3 min-w-0 overflow-hidden">
                    <DutyTable
                        rosters={rosters}
                        currentUserId={user?.id}
                        isAdmin={isAdmin}
                        allMembers={initialMembers}
                        onAssignMember={toggleDutySlot}
                        onRemoveMember={toggleDutySlot}
                        isPending={isPending}
                    />
                </div>
            </div>
        </div>
    );
}
