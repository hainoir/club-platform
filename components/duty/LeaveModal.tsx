'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarOff, Check, KeyRound } from 'lucide-react';
import { useToast } from '@/components/ui/toast-simple';
import { useDuty } from '@/hooks/useDuty';
import { useUserStore } from '@/store/useUserStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

const DAYS = ['一', '二', '三', '四', '五'];
const PERIODS = [
    { id: 1, label: '第一大节' },
    { id: 2, label: '第二大节' },
    { id: 3, label: '第三大节' },
    { id: 4, label: '第四大节' },
];

interface LeaveModalProps {
    dutyManager: ReturnType<typeof useDuty>;
}

export function LeaveModal({ dutyManager }: LeaveModalProps) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useUserStore();
    const { rosters, submitLeave, submitSwapRequest } = dutyManager;

    // 步骤状态
    const [selectedRosterId, setSelectedRosterId] = useState('');
    const [penaltyShifts, setPenaltyShifts] = useState(1);
    const [selectedComps, setSelectedComps] = useState<{ day: number; period: number }[]>([]);
    const [reason, setReason] = useState('');
    const [needSubstitute, setNeedSubstitute] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 我的排班
    const myRosters = rosters.filter(r => r.member_id === user?.id)
        .sort((a, b) => a.day_of_week === b.day_of_week ? a.period - b.period : a.day_of_week - b.day_of_week);

    // 当前选中的排班记录
    const selectedRoster = useMemo(
        () => myRosters.find(r => r.id === selectedRosterId),
        [myRosters, selectedRosterId]
    );

    // 选中班次是否持有钥匙
    const selectedHasKey = selectedRoster?.has_key ?? false;

    // 重置表单
    useEffect(() => {
        if (open) {
            setSelectedRosterId('');
            setPenaltyShifts(1);
            setSelectedComps([]);
            setReason('');
            setNeedSubstitute(false);
        }
    }, [open]);



    // 切换补班节次选择
    const toggleComp = (day: number, period: number) => {
        const exists = selectedComps.find(c => c.day === day && c.period === period);
        if (exists) {
            setSelectedComps(selectedComps.filter(c => !(c.day === day && c.period === period)));
        } else {
            if (selectedComps.length < penaltyShifts) {
                setSelectedComps([...selectedComps, { day, period }]);
            } else {
                toast({ title: `最多选择 ${penaltyShifts} 个补班节次`, variant: 'destructive' });
            }
        }
    };

    // 补班数量变更时清除多余的选择
    useEffect(() => {
        if (selectedComps.length > penaltyShifts) {
            setSelectedComps(selectedComps.slice(0, penaltyShifts));
        }
    }, [penaltyShifts]);

    const handleSubmit = async () => {
        if (!selectedRoster) {
            toast({ title: '请选择班次', variant: 'destructive' });
            return;
        }
        if (selectedComps.length !== penaltyShifts) {
            toast({ title: `请选择 ${penaltyShifts} 个补班节次`, variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);

        // 1. 提交请假申请
        const success = await submitLeave(
            selectedRoster.day_of_week,
            selectedRoster.period,
            reason,
            penaltyShifts,
            selectedComps.map(c => ({ day_of_week: c.day, period: c.period }))
        );

        // 2. 如果需要代班，自动创建代班请求
        if (success && needSubstitute) {
            await submitSwapRequest(
                selectedRoster.day_of_week,
                selectedRoster.period
                // 不指定 targetId/targetDay/targetPeriod → 公开到代班大厅
            );
        }

        setIsSubmitting(false);

        if (success) {
            setOpen(false);
        }
    };

    const canSubmit = selectedRosterId && selectedComps.length === penaltyShifts;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-muted-foreground">
                    <CalendarOff className="w-4 h-4 mr-2" />
                    我要请假...
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>请假申请</DialogTitle>
                    <DialogDescription>
                        请选择要请假的班次，并安排下周的补班节次。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 mt-4">
                    {/* 步骤 1: 选择班次 */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">选择请假班次</Label>
                        {myRosters.length === 0 ? (
                            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                                您当前没有排班，无法请假。
                            </p>
                        ) : (
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={selectedRosterId}
                                onChange={e => setSelectedRosterId(e.target.value)}
                            >
                                <option value="" disabled>-- 请选择 --</option>
                                {myRosters.map(r => (
                                    <option key={r.id} value={r.id}>
                                        周{DAYS[r.day_of_week - 1]} 第{r.period}大节 {r.has_key ? '🔑' : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* 是否需要代班开关 */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <label htmlFor="need-substitute" className="text-sm font-medium flex items-center gap-2">
                                <KeyRound className="w-4 h-4 text-amber-500" />
                                是否需要人代替你来开关门？
                            </label>
                            <Switch
                                id="need-substitute"
                                checked={needSubstitute}
                                onCheckedChange={setNeedSubstitute}
                            />
                        </div>
                        {needSubstitute && (
                            <p className="text-xs text-amber-600 dark:text-amber-500">
                                提交后将自动发布代班请求至公共大厅，等待其他成员应答。
                            </p>
                        )}
                    </div>

                    {/* 步骤 2: 补班节数 */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">补班节数</Label>
                        <div className="flex gap-2">
                            {[1, 2].map(n => (
                                <Button
                                    key={n}
                                    type="button"
                                    size="sm"
                                    variant={penaltyShifts === n ? 'default' : 'outline'}
                                    onClick={() => setPenaltyShifts(n)}
                                >
                                    补 {n} 节
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* 步骤 3: 选择补班节次 */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            选择下周补班节次
                            <span className="text-muted-foreground font-normal ml-1">
                                ({selectedComps.length}/{penaltyShifts})
                            </span>
                        </Label>
                        <div className="border rounded-md overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr>
                                        <th className="p-2 bg-muted/40 border-b text-muted-foreground"></th>
                                        {DAYS.map((d, i) => (
                                            <th key={i} className="p-2 bg-muted/20 border-b border-l text-center font-medium">
                                                周{d}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {PERIODS.map(p => (
                                        <tr key={p.id}>
                                            <td className="p-2 border-b text-center text-muted-foreground whitespace-nowrap">
                                                {p.label}
                                            </td>
                                            {DAYS.map((_, di) => {
                                                const day = di + 1;
                                                const isSelected = selectedComps.some(c => c.day === day && c.period === p.id);
                                                return (
                                                    <td key={`${day}-${p.id}`} className="border-b border-l p-1 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleComp(day, p.id)}
                                                            className={cn(
                                                                "w-full h-8 rounded transition-all text-xs",
                                                                isSelected
                                                                    ? "bg-primary text-primary-foreground shadow-sm"
                                                                    : "hover:bg-muted/50"
                                                            )}
                                                        >
                                                            {isSelected && <Check className="w-3 h-3 mx-auto" />}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 步骤 4: 请假原因（可选） */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            请假原因 <span className="text-muted-foreground font-normal">(可选)</span>
                        </Label>
                        <Input
                            placeholder="例如：临时有课程调整"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                        />
                    </div>

                    {/* 提交 */}
                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={!canSubmit || isSubmitting}
                        >
                            {isSubmitting ? '提交中...' : (needSubstitute ? '提交请假并发布代班' : '提交请假')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
