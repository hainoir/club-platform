'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Target } from 'lucide-react';
import type { SwapWithMember } from '@/hooks/useDuty';

interface SwapActionButtonsProps {
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
 * 代班请求的操作按钮区域
 *
 * 根据当前用户身份（发起人、目标、管理员）和代班状态（pending、accepted、定向、公共）
 * 渲染不同的操作按钮或状态徽章。
 */
export function SwapActionButtons({
    swap,
    currentUserId,
    isAdminMode,
    canReview,
    isSwapping,
    onRespond,
    onVolunteer,
    onReject,
}: SwapActionButtonsProps) {
    const isMine = swap.requester_id === currentUserId;
    const isTarget = swap.target_id === currentUserId;
    const isPending = swap.status === 'pending';
    const isAccepted = swap.status === 'accepted';
    const isTargeted = Boolean(swap.target_id);
    const isPublicPending = isPending && !isTargeted;

    // 发起人视角：可以撤回，定向请求可退回大厅
    if (!isAdminMode && isMine) {
        return (
            <div className="flex flex-wrap gap-1">
                {isPending && isTargeted && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => onReject(swap.id)}
                        disabled={isSwapping}
                    >
                        退回大厅
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive"
                    onClick={() => onRespond(swap.id, false)}
                    disabled={isSwapping}
                >
                    撤回
                </Button>
            </div>
        );
    }

    // 管理员审批视角：已应答的请求可批准或驳回
    if (canReview && isAccepted) {
        return (
            <div className="flex gap-1">
                <Button
                    size="sm"
                    className="h-8"
                    onClick={() => onRespond(swap.id, true)}
                    disabled={isSwapping}
                >
                    批准
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive"
                    onClick={() => onReject(swap.id)}
                    disabled={isSwapping}
                >
                    驳回
                </Button>
            </div>
        );
    }

    // 被邀请人视角：可接受或拒绝
    if (!isAdminMode && isPending && isTarget) {
        return (
            <div className="flex gap-1">
                <Button
                    size="sm"
                    className="h-8"
                    onClick={() => onVolunteer(swap.id)}
                    disabled={isSwapping}
                >
                    接受代班
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => onReject(swap.id)}
                    disabled={isSwapping}
                >
                    拒绝并退回大厅
                </Button>
            </div>
        );
    }

    // 公共请求：任何人可认领
    if (!isAdminMode && isPublicPending) {
        return (
            <Button
                size="sm"
                className="h-8"
                onClick={() => onVolunteer(swap.id)}
                disabled={isSwapping}
            >
                帮他代班
            </Button>
        );
    }

    // 只读状态徽章
    if (isAccepted) {
        return (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                <Clock className="mr-1 h-3 w-3" />
                等待管理员审批
            </Badge>
        );
    }

    if (isPending && isTargeted) {
        return (
            <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-400">
                <Target className="mr-1 h-3 w-3" />
                定向邀请中
            </Badge>
        );
    }

    return null;
}
