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
import { RefreshCw } from 'lucide-react';
import type { SwapWithMember } from '@/hooks/useDuty';
import { useUserStore, isAdminRole } from '@/store/useUserStore';
import { SwapCard } from './SwapCard';

interface SwapModalProps {
    swaps: SwapWithMember[];
    refreshSwaps: () => void | Promise<void>;
    respondToSwap: (swapId: string, accept: boolean) => void | Promise<void>;
    volunteerForSwap: (swapId: string) => void | Promise<void>;
    rejectSwap: (swapId: string) => void | Promise<void>;
    isSwapping: boolean;
    mode?: 'member' | 'admin';
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
                            {visibleSwaps.map((swap) => (
                                <SwapCard
                                    key={swap.id}
                                    swap={swap}
                                    currentUserId={user?.id}
                                    isAdminMode={isAdminMode}
                                    canReview={canReview}
                                    isSwapping={isSwapping}
                                    onRespond={respondToSwap}
                                    onVolunteer={volunteerForSwap}
                                    onReject={rejectSwap}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
