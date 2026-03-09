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
import { useToast } from '@/components/ui/toast-simple';
import { useDuty } from '@/hooks/useDuty';
import { useUserStore, ADMIN_ROLES } from '@/store/useUserStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const DAYS = ['一', '二', '三', '四', '五'];

interface SwapModalProps {
    dutyManager: ReturnType<typeof useDuty>;
}

export function SwapModal({ dutyManager }: SwapModalProps) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useUserStore();
    const { rosters, swaps, refreshSwaps, submitSwapRequest, respondToSwap, volunteerForSwap, rejectSwap, isSwapping } = dutyManager;

    const isAdmin = ADMIN_ROLES.includes(user?.role || '');

    // 只提取出该用户本人的排班以供其选择
    const myRosters = rosters.filter(r => r.member_id === user?.id)
        .sort((a, b) => a.day_of_week === b.day_of_week ? a.period - b.period : a.day_of_week - b.day_of_week);

    const [selectedMyRosterId, setSelectedMyRosterId] = useState<string>('');

    useEffect(() => {
        if (open) {
            refreshSwaps();
            setSelectedMyRosterId('');
        }
    }, [open, refreshSwaps]);

    const handleApply = async () => {
        const roster = myRosters.find(r => r.id === selectedMyRosterId);
        if (!roster) {
            toast({ title: '表单不完整', description: '请先选择一个你要调出或找人代班的时段', variant: 'destructive' });
            return;
        }

        // 以发布公共代班请求为例 (target_id 为空)
        const success = await submitSwapRequest(roster.day_of_week, roster.period);
        if (success) {
            setOpen(false);
        }
    };

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
                <Button variant="outline" className="w-full justify-start text-muted-foreground mt-4">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    找人代换班...
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>换班与代班大厅</DialogTitle>
                    <DialogDescription>
                        您可以在此处理悬挂在大厅中的请求，或者主动提交自己的换班需求。
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="receive" className="w-full mt-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="receive">大厅里的请求</TabsTrigger>
                        <TabsTrigger value="send">我要找人代班</TabsTrigger>
                    </TabsList>

                    {/* 请求列表面板 */}
                    <TabsContent value="receive" className="pt-4 h-[250px] overflow-y-auto">
                        {swaps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground border border-dashed rounded-lg">
                                <RefreshCw className="w-8 h-8 opacity-20 mb-2" />
                                <span className="text-sm">目前大厅里没有任何换班请求</span>
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
                    </TabsContent>

                    {/* 发出请求面板 */}
                    <TabsContent value="send" className="pt-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">选择要换出的班次：</label>
                            {myRosters.length === 0 ? (
                                <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                                    您当前本周并未排任何班次，无法发起换班请求。
                                </p>
                            ) : (
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                                    value={selectedMyRosterId}
                                    onChange={(e) => setSelectedMyRosterId(e.target.value)}
                                >
                                    <option value="" disabled>-- 请选择你的班次 --</option>
                                    {myRosters.map(r => (
                                        <option key={r.id} value={r.id}>
                                            周{DAYS[r.day_of_week - 1]} 的 第{r.period}大节
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <div className="flex justify-end space-x-2 pt-4 border-t">
                            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
                            <Button
                                onClick={handleApply}
                                disabled={selectedMyRosterId === '' || isSwapping}
                            >
                                发布到大厅
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
