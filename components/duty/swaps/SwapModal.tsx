'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, UserCircle2, ArrowRight, Clock, CheckCircle2, Target } from 'lucide-react';
import type { SwapWithMember } from '@/hooks/useDuty';
import { useUserStore, isAdminRole } from '@/store/useUserStore';
import { Badge } from '@/components/ui/badge';

const DAYS = ['一', '二', '三', '四', '五'];

interface SwapModalProps {
    swaps: SwapWithMember[];
    refreshSwaps: () => void | Promise<void>;
    respondToSwap: (swapId: string, accept: boolean) => void | Promise<void>;
    volunteerForSwap: (swapId: string) => void | Promise<void>;
    rejectSwap: (swapId: string) => void | Promise<void>;
    isSwapping: boolean;
    mode?: 'member' | 'admin';
}

function formatSwapStatus(swap: SwapWithMember) {
    if (swap.status === 'accepted') {
        return `${swap.target?.name || '成员'} 已应答`;
    }

    if (swap.target_id) {
        return `定向给 ${swap.target?.name || '成员'}`;
    }

    return '公共代班';
}

export function SwapModal({
    swaps,
    refreshSwaps,
    respondToSwap,
    volunteerForSwap,
    rejectSwap,
    isSwapping,
    mode = 'member',
}: SwapModalProps) {
    const [open, setOpen] = useState(false);
    const { user } = useUserStore();

    const isAdmin = isAdminRole(user?.role);
    const isAdminMode = mode === 'admin';
    const canReview = isAdminMode && isAdmin;

    useEffect(() => {
        if (open) {
            refreshSwaps();
        }
    }, [open, refreshSwaps]);

    const sortedSwaps = useMemo(() => {
        return [...swaps].sort((left, right) => {
            const leftPriority = left.status === 'accepted' ? 0 : left.target_id ? 1 : 2;
            const rightPriority = right.status === 'accepted' ? 0 : right.target_id ? 1 : 2;
            if (leftPriority !== rightPriority) return leftPriority - rightPriority;
            return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        });
    }, [swaps]);

    const visibleSwaps = useMemo(() => {
        if (isAdminMode) {
            return sortedSwaps.filter((swap) => swap.status === 'accepted');
        }

        return sortedSwaps.filter((swap) => {
            const isMine = swap.requester_id === user?.id;
            const isTarget = swap.target_id === user?.id;
            const isPublicPending = swap.status === 'pending' && !swap.target_id;
            return isMine || isTarget || isPublicPending;
        });
    }, [isAdminMode, sortedSwaps, user?.id]);

    const renderActions = (swap: SwapWithMember) => {
        const isMine = swap.requester_id === user?.id;
        const isTarget = swap.target_id === user?.id;
        const isPending = swap.status === 'pending';
        const isAccepted = swap.status === 'accepted';
        const isTargeted = Boolean(swap.target_id);
        const isPublicPending = isPending && !isTargeted;

        if (!isAdminMode && isMine) {
            return (
                <div className="flex flex-wrap gap-1">
                    {isPending && isTargeted && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => rejectSwap(swap.id)}
                            disabled={isSwapping}
                        >
                            退回大厅
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive"
                        onClick={() => respondToSwap(swap.id, false)}
                        disabled={isSwapping}
                    >
                        撤回
                    </Button>
                </div>
            );
        }

        if (canReview && isAccepted) {
            return (
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        className="h-8"
                        onClick={() => respondToSwap(swap.id, true)}
                        disabled={isSwapping}
                    >
                        批准
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive"
                        onClick={() => rejectSwap(swap.id)}
                        disabled={isSwapping}
                    >
                        驳回
                    </Button>
                </div>
            );
        }

        if (!isAdminMode && isPending && isTarget) {
            return (
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        className="h-8"
                        onClick={() => volunteerForSwap(swap.id)}
                        disabled={isSwapping}
                    >
                        接受代班
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => rejectSwap(swap.id)}
                        disabled={isSwapping}
                    >
                        拒绝并退回大厅
                    </Button>
                </div>
            );
        }

        if (!isAdminMode && isPublicPending) {
            return (
                <Button
                    size="sm"
                    className="h-8"
                    onClick={() => volunteerForSwap(swap.id)}
                    disabled={isSwapping}
                >
                    帮他代班
                </Button>
            );
        }

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
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start text-muted-foreground"
                    disabled={isAdminMode && !isAdmin}
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {isAdminMode ? '代班审批' : '代班大厅...'}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{isAdminMode ? '代班审批' : '代班大厅'}</DialogTitle>
                    <DialogDescription>
                        {isAdminMode
                            ? '这里只处理已经有人应答、等待管理员最终审批的代班请求。'
                            : '这里只展示你当前有权限看到的代班请求：公共请求、与你相关的定向请求，以及你发起的请求。'}
                    </DialogDescription>
                </DialogHeader>

                <div className="h-[360px] overflow-y-auto pt-4">
                    {visibleSwaps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">
                            <RefreshCw className="mb-2 h-8 w-8 opacity-20" />
                            <span className="text-sm">{isAdminMode ? '当前没有待审批的代班请求' : '当前没有你可见的代班请求'}</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {visibleSwaps.map((swap) => {
                                const isMine = swap.requester_id === user?.id;
                                const isTargeted = Boolean(swap.target_id);
                                const isAccepted = swap.status === 'accepted';

                                return (
                                    <div key={swap.id} className="rounded-md border p-3 text-sm">
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
                                            <div>{renderActions(swap)}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
