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
import { DutyCompensationSlot, listCompensationSlotsForDuty } from '@/lib/duty-time';

const DAYS = ['一', '二', '三', '四', '五'];

interface LeaveModalProps {
    dutyManager: ReturnType<typeof useDuty>;
}

function getCompensationSlotKey(slot: DutyCompensationSlot) {
    return `${slot.dateKey}-${slot.period}`;
}

function formatCompensationSlotLabel(slot: DutyCompensationSlot) {
    const [, month, day] = slot.dateKey.split('-');
    return `${Number(month)}/${Number(day)} 周${DAYS[slot.dayOfWeek - 1]} 第${slot.period}大节`;
}

export function LeaveModal({ dutyManager }: LeaveModalProps) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useUserStore();
    const { rosters, submitLeave, submitSwapRequest } = dutyManager;

    // 步骤状态
    const [selectedRosterId, setSelectedRosterId] = useState('');
    const [penaltyShifts, setPenaltyShifts] = useState(1);
    const [selectedCompKeys, setSelectedCompKeys] = useState<string[]>([]);
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

    const compensationSlots = useMemo(
        () => selectedRoster
            ? listCompensationSlotsForDuty(selectedRoster.day_of_week, selectedRoster.period)
            : [],
        [selectedRoster]
    );

    const selectedCompSlots = useMemo(() => {
        const slotMap = new Map(compensationSlots.map((slot) => [getCompensationSlotKey(slot), slot]));
        return selectedCompKeys
            .map((key) => slotMap.get(key))
            .filter((slot): slot is DutyCompensationSlot => Boolean(slot));
    }, [compensationSlots, selectedCompKeys]);

    const groupedCompensationSlots = useMemo(() => ({
        currentWeek: compensationSlots.filter((slot) => slot.weekOffset === 0),
        nextWeek: compensationSlots.filter((slot) => slot.weekOffset === 1),
    }), [compensationSlots]);

    // 重置表单
    useEffect(() => {
        if (open) {
            setSelectedRosterId('');
            setPenaltyShifts(1);
            setSelectedCompKeys([]);
            setReason('');
            setNeedSubstitute(false);
        }
    }, [open]);



    // 切换补班节次选择
    const toggleComp = (slot: DutyCompensationSlot) => {
        const slotKey = getCompensationSlotKey(slot);
        setSelectedCompKeys((prev) => {
            if (prev.includes(slotKey)) {
                return prev.filter((key) => key !== slotKey);
            }
            if (prev.length >= penaltyShifts) {
                toast({ title: `最多选择 ${penaltyShifts} 个补班节次`, variant: 'destructive' });
                return prev;
            }
            return [...prev, slotKey];
        });
    };

    // 补班数量或可选范围变更时，清除多余或无效的选择
    useEffect(() => {
        const availableKeys = new Set(compensationSlots.map((slot) => getCompensationSlotKey(slot)));
        setSelectedCompKeys(prev =>
            prev.filter((key) => availableKeys.has(key)).slice(0, penaltyShifts)
        );
    }, [compensationSlots, penaltyShifts]);

    const compensationSections = [
        {
            key: 'current-week',
            title: '本周剩余班次',
            description: '从该请假班次之后，到本周五结束前可补的班次。',
            slots: groupedCompensationSlots.currentWeek,
        },
        {
            key: 'next-week',
            title: '下周所有班次',
            description: '下周一至周五的全部班次都可作为补班。',
            slots: groupedCompensationSlots.nextWeek,
        },
    ];

    const selectedCompCount = selectedCompKeys.length;

    const handleSubmit = async () => {
        if (!selectedRoster) {
            toast({ title: '请选择班次', variant: 'destructive' });
            return;
        }
        if (selectedCompSlots.length !== penaltyShifts) {
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
            selectedCompSlots.map((slot) => ({
                compensation_date: slot.dateKey,
                day_of_week: slot.dayOfWeek,
                period: slot.period,
            }))
        );

        // 2. 如果需要代班，自动创建代班请求
        if (success && needSubstitute) {
            await submitSwapRequest(
                selectedRoster.day_of_week,
                selectedRoster.period
                // 不指定目标成员和目标时段，直接公开到代班大厅
            );
        }

        setIsSubmitting(false);

        if (success) {
            setOpen(false);
        }
    };

    const canSubmit = selectedRosterId && selectedCompSlots.length === penaltyShifts;

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
                        请选择要请假的班次，并在本周剩余班次或下周所有班次中安排补班。
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
                            选择可补班节次
                            <span className="text-muted-foreground font-normal ml-1">
                                ({selectedCompCount}/{penaltyShifts})
                            </span>
                        </Label>
                        {!selectedRoster ? (
                            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                请先选择要请假的班次，再安排补班。
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {compensationSections.map((section) => (
                                    <div key={section.key} className="space-y-2">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium">{section.title}</p>
                                                <p className="text-xs text-muted-foreground">{section.description}</p>
                                            </div>
                                            <span className="text-xs text-muted-foreground">{section.slots.length} 个可选</span>
                                        </div>

                                        {section.slots.length === 0 ? (
                                            <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                                                当前没有可补班次。
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                {section.slots.map((slot) => {
                                                    const slotKey = getCompensationSlotKey(slot);
                                                    const isSelected = selectedCompKeys.includes(slotKey);

                                                    return (
                                                        <button
                                                            key={slotKey}
                                                            type="button"
                                                            onClick={() => toggleComp(slot)}
                                                            className={cn(
                                                                "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                                                isSelected
                                                                    ? "border-primary bg-primary/10 text-primary"
                                                                    : "border-border hover:bg-muted/50"
                                                            )}
                                                        >
                                                            <span>{formatCompensationSlotLabel(slot)}</span>
                                                            {isSelected && <Check className="h-4 w-4 shrink-0" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
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
