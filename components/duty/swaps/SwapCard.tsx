'use client';

import { UserCircle2, ArrowRight, CheckCircle2, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SwapWithMember } from '@/hooks/useDuty';
import { DUTY_DAY_SHORT_LABELS } from '@/lib/duty/duty-constants';
import { SwapActionButtons } from './SwapActionButtons';

const DAYS = DUTY_DAY_SHORT_LABELS;

function formatSwapStatus(swap: SwapWithMember) {
    if (swap.status === 'accepted') {
        return `${swap.target?.name || '成员'} 已应答`;
    }
    if (swap.target_id) {
        return `定向给 ${swap.target?.name || '成员'}`;
    }
    return '公共代班';
}

interface SwapCardProps {
    swap: SwapWithMember;
    currentUserId?: string;
    isAdminMode: boolean;
    canReview: boolean;
    isSwapping: boolean;
    onRespond: (swapId: string, accept: boolean) => void | Promise<void>;
    onVolunteer: (swapId: string) => void | Promise<void>;
    onReject: (swapId: string) => void | Promise<void>;
}

/**
 * 单条代班请求卡片
 *
 * 展示发起人信息、代班时段、状态标签和操作按钮。
 */
export function SwapCard({
    swap,
    currentUserId,
    isAdminMode,
    canReview,
    isSwapping,
    onRespond,
    onVolunteer,
    onReject,
}: SwapCardProps) {
    const isMine = swap.requester_id === currentUserId;
    const isTargeted = Boolean(swap.target_id);
    const isAccepted = swap.status === 'accepted';

    return (
        <div className="rounded-md border p-3 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <span className="flex items-center font-medium">
                        <UserCircle2 className="mr-1 h-4 w-4 text-primary" />
                        {swap.requester.name}
                        {isMine && '（我）'}
                    </span>
                    <span className="mt-1 flex items-center text-muted-foreground">
                        周{DAYS[swap.original_day - 1]} 第{swap.original_period}大节
                        <ArrowRight className="mx-1 h-3 w-3" />
                        {formatSwapStatus(swap)}
                    </span>
                    <div className="flex flex-wrap gap-1 pt-1">
                        {isAccepted ? (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                已应答待审批
                            </Badge>
                        ) : isTargeted ? (
                            <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-400">
                                <Target className="mr-1 h-3 w-3" />
                                定向请求
                            </Badge>
                        ) : (
                            <Badge variant="outline">公共请求</Badge>
                        )}
                        {swap.leave_id && <Badge variant="outline">关联请假</Badge>}
                    </div>
                </div>
                <div>
                    <SwapActionButtons
                        swap={swap}
                        currentUserId={currentUserId}
                        isAdminMode={isAdminMode}
                        canReview={canReview}
                        isSwapping={isSwapping}
                        onRespond={onRespond}
                        onVolunteer={onVolunteer}
                        onReject={onReject}
                    />
                </div>
            </div>
        </div>
    );
}
