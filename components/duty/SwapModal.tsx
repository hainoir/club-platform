import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw, UserCircle2, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';
import { useDuty } from '@/hooks/useDuty';
import { useUserStore, ADMIN_ROLES } from '@/store/useUserStore';
import { Badge } from "@/components/ui/badge";

const DAYS = ['一', '二', '三', '四', '五'];

interface SwapModalProps {
    dutyManager: ReturnType<typeof useDuty>;
}

export function SwapModal({ dutyManager }: SwapModalProps) {
    const [open, setOpen] = useState(false);
    const { user } = useUserStore();
    const { swaps, refreshSwaps, respondToSwap, volunteerForSwap, rejectSwap, isSwapping } = dutyManager;

    const isAdmin = ADMIN_ROLES.includes(user?.role || '');

    useEffect(() => {
        if (open) {
            refreshSwaps();
        }
    }, [open, refreshSwaps]);

    // 渲染每条请求的操作按钮
    const renderActions = (req: typeof swaps[number]) => {
        const isMine = req.requester_id === user?.id;
        const isPending = req.status === 'pending';
        const isAccepted = req.status === 'accepted';

        // 请求人自己：可以撤回
        if (isMine) {
            return (
                <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive h-8"
                    onClick={() => respondToSwap(req.id, false)}
                    disabled={isSwapping}
                >
                    撤回
                </Button>
            );
        }

        // 管理员看 accepted 状态：批准/驳回
        if (isAdmin && isAccepted) {
            return (
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        className="h-8"
                        onClick={() => respondToSwap(req.id, true)}
                        disabled={isSwapping}
                    >
                        批准
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive h-8"
                        onClick={() => rejectSwap(req.id)}
                        disabled={isSwapping}
                    >
                        驳回
                    </Button>
                </div>
            );
        }

        // pending 状态且不是自己的请求：可以应答
        if (isPending) {
            return (
                <Button
                    size="sm"
                    className="h-8"
                    onClick={() => volunteerForSwap(req.id)}
                    disabled={isSwapping}
                >
                    帮他代班
                </Button>
            );
        }

        // accepted 状态但非管理员：显示等待审批
        if (isAccepted) {
            return (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/30">
                    <Clock className="w-3 h-3 mr-1" />
                    等待审批
                </Badge>
            );
        }

        return null;
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-muted-foreground">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    代班大厅...
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>代班大厅</DialogTitle>
                    <DialogDescription>
                        查看并接受大厅中的代班请求，帮助其他成员代替值班。
                    </DialogDescription>
                </DialogHeader>

                <div className="pt-4 h-[300px] overflow-y-auto">
                    {swaps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-muted-foreground border border-dashed rounded-lg">
                            <RefreshCw className="w-8 h-8 opacity-20 mb-2" />
                            <span className="text-sm">目前大厅里没有任何代班请求</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {swaps.map(req => {
                                const isMine = req.requester_id === user?.id;
                                const isAccepted = req.status === 'accepted';
                                return (
                                    <div key={req.id} className="flex items-center justify-between p-3 rounded-md border text-sm">
                                        <div className="flex flex-col">
                                            <span className="font-medium flex items-center">
                                                <UserCircle2 className="w-4 h-4 mr-1 text-primary" />
                                                {req.requester.name} {isMine && '(我)'} 发布的请求
                                            </span>
                                            <span className="text-muted-foreground mt-1 flex items-center">
                                                周{DAYS[req.original_day - 1]} 第{req.original_period}大节
                                                <ArrowRight className="w-3 h-3 mx-1" />
                                                {isAccepted
                                                    ? <span className="text-amber-600 dark:text-amber-400 flex items-center">
                                                        <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                                        {req.target?.name} 已应答
                                                    </span>
                                                    : `公共代班寻人`}
                                            </span>
                                        </div>
                                        <div>
                                            {renderActions(req)}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
