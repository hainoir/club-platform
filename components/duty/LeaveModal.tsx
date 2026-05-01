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
import { CalendarOff, Check, KeyRound, UserCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast-simple';
import { useDuty } from '@/hooks/useDuty';
import { useUserStore, isAdminRole } from '@/store/useUserStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { DutyCompensationSlot, listCompensationSlotsForDuty } from '@/lib/duty-time';
import { filterPendingLeavesWithoutSwap } from '@/lib/duty-leaves';
import type { SimpleMember } from '@/components/duty/DutyTable';

const DAYS = ['一', '二', '三', '四', '五'];

interface LeaveModalProps {
    dutyManager: ReturnType<typeof useDuty>;
    allMembers: SimpleMember[];
    mode?: 'member' | 'admin';
}

function getCompensationSlotKey(slot: DutyCompensationSlot) {
    return `${slot.dateKey}-${slot.period}`;
}

function getDutySlotKey(dayOfWeek: number, period: number) {
    return `${dayOfWeek}-${period}`;
}

function formatDutySlot(dayOfWeek: number, period: number) {
    return `周${DAYS[dayOfWeek - 1]} 第${period}大节`;
}

function formatCompensationSlotLabel(slot: DutyCompensationSlot) {
    const [, month, day] = slot.dateKey.split('-');
    return `${Number(month)}/${Number(day)} 周${DAYS[slot.dayOfWeek - 1]} 第${slot.period}大节`;
}

function formatPendingLeaveState(
    swap: ReturnType<typeof useDuty>['swaps'][number] | undefined
) {
    if (!swap) {
        return '无需代班，等待管理员审批';
    }

    if (swap.status === 'accepted') {
        return `已由 ${swap.target?.name || '成员'} 应答，等待管理员审批`;
    }

    if (swap.target_id) {
        return `已定向给 ${swap.target?.name || '成员'}，等待应答`;
    }

    return '公共大厅待应答';
}

export function LeaveModal({ dutyManager, allMembers, mode = 'member' }: LeaveModalProps) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const { user } = useUserStore();
    const {
        rosters,
        approvedLeaves,
        pendingLeaves,
        swaps,
        submitLeave,
        respondToSwap,
        rejectSwap,
        approvePendingLeave,
        deletePendingLeave,
        isSwapping,
    } = dutyManager;

    const isAdmin = isAdminRole(user?.role);
    const isAdminMode = mode === 'admin';
    const canReview = isAdminMode && isAdmin;

    const [selectedRosterId, setSelectedRosterId] = useState('');
    const [penaltyShifts, setPenaltyShifts] = useState(1);
    const [selectedCompKeys, setSelectedCompKeys] = useState<string[]>([]);
    const [reason, setReason] = useState('');
    const [needSubstitute, setNeedSubstitute] = useState(false);
    const [targetMemberId, setTargetMemberId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const ownBlockedSlots = useMemo(() => {
        const blocked = new Set<string>();
        [...approvedLeaves, ...pendingLeaves]
            .filter((leave) => leave.member_id === user?.id)
            .forEach((leave) => blocked.add(getDutySlotKey(leave.day_of_week, leave.period)));
        return blocked;
    }, [approvedLeaves, pendingLeaves, user?.id]);

    const myRosters = useMemo(() => (
        rosters
            .filter((roster) => roster.member_id === user?.id)
            .filter((roster) => !ownBlockedSlots.has(getDutySlotKey(roster.day_of_week, roster.period)))
            .sort((a, b) => (
                a.day_of_week === b.day_of_week
                    ? a.period - b.period
                    : a.day_of_week - b.day_of_week
            ))
    ), [rosters, user?.id, ownBlockedSlots]);

    const selectedRoster = useMemo(
        () => myRosters.find((roster) => roster.id === selectedRosterId),
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

    const memberOptions = useMemo(
        () => allMembers.filter((member) => member.id !== user?.id),
        [allMembers, user?.id]
    );

    const myPendingLeaves = useMemo(
        () => pendingLeaves.filter((leave) => leave.member_id === user?.id),
        [pendingLeaves, user?.id]
    );

    const swapByLeaveId = useMemo(() => {
        const map = new Map<string, typeof swaps[number]>();
        swaps.forEach((swap) => {
            if (swap.leave_id) {
                map.set(swap.leave_id, swap);
            }
        });
        return map;
    }, [swaps]);

    const adminPendingDirectLeaves = useMemo(() => {
        if (!canReview) return [];
        return filterPendingLeavesWithoutSwap(pendingLeaves, swaps);
    }, [canReview, pendingLeaves, swaps]);

    useEffect(() => {
        if (!open) return;

        setSelectedRosterId('');
        setPenaltyShifts(1);
        setSelectedCompKeys([]);
        setReason('');
        setNeedSubstitute(false);
        setTargetMemberId('');
    }, [open]);

    useEffect(() => {
        if (!needSubstitute) {
            setTargetMemberId('');
        }
    }, [needSubstitute]);

    useEffect(() => {
        const availableKeys = new Set(compensationSlots.map((slot) => getCompensationSlotKey(slot)));
        setSelectedCompKeys((prev) => prev.filter((key) => availableKeys.has(key)).slice(0, penaltyShifts));
    }, [compensationSlots, penaltyShifts]);

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

        const success = await submitLeave(
            selectedRoster.day_of_week,
            selectedRoster.period,
            reason,
            penaltyShifts,
            selectedCompSlots.map((slot) => ({
                compensation_date: slot.dateKey,
                day_of_week: slot.dayOfWeek,
                period: slot.period,
            })),
            needSubstitute,
            targetMemberId || null
        );

        setIsSubmitting(false);

        if (success) {
            setOpen(false);
        }
    };

    const canSubmit = Boolean(selectedRosterId) && selectedCompSlots.length === penaltyShifts;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="w-full justify-start text-muted-foreground"
                    disabled={isAdminMode && !isAdmin}
                >
                    <CalendarOff className="w-4 h-4 mr-2" />
                    {isAdminMode ? '请假审批' : '我要请假...'}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[620px]">
                <DialogHeader>
                    <DialogTitle>{isAdminMode ? '请假审批' : '请假申请'}</DialogTitle>
                    <DialogDescription>
                        {isAdminMode
                            ? '这里只处理无需代班、等待管理员直接审批的请假请求。'
                            : '提交后先进入待审批状态。只有管理员批准后，请假才会正式生效。'}
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 max-h-[70vh] space-y-6 overflow-y-auto pr-1">
                    {!isAdminMode && (
                        <>
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">选择请假班次</Label>
                            {myRosters.length === 0 ? (
                                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                                    当前没有可发起的新请假班次。已提交或已生效的班次不会重复出现在这里。
                                </p>
                            ) : (
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={selectedRosterId}
                                    onChange={(event) => setSelectedRosterId(event.target.value)}
                                >
                                    <option value="" disabled>-- 请选择 --</option>
                                    {myRosters.map((roster) => (
                                        <option key={roster.id} value={roster.id}>
                                            {formatDutySlot(roster.day_of_week, roster.period)} {roster.has_key ? '🔑' : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                            <div className="flex items-center justify-between gap-4">
                                <label htmlFor="need-substitute" className="text-sm font-medium flex items-center gap-2">
                                    <KeyRound className="w-4 h-4 text-amber-500" />
                                    是否需要代班
                                </label>
                                <Switch
                                    id="need-substitute"
                                    checked={needSubstitute}
                                    onCheckedChange={setNeedSubstitute}
                                />
                            </div>
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                                {needSubstitute
                                    ? '会先创建待审批请假，并同步生成代班请求。管理员批准后请假才生效。'
                                    : '无需代班时，仅创建待审批请假，等待管理员直接审批。'}
                            </p>
                        </div>

                        {needSubstitute && (
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">可选代班成员</Label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={targetMemberId}
                                    onChange={(event) => setTargetMemberId(event.target.value)}
                                >
                                    <option value="">不指定，发布到公共大厅</option>
                                    {memberOptions.map((member) => (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                            {member.student_id ? ` (${member.student_id})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-muted-foreground">
                                    指定成员时，初始只有你、目标成员和管理员可见。对方拒绝或你主动退回后，会转成公共请求。
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">补班节数</Label>
                            <div className="flex gap-2">
                                {[1, 2].map((count) => (
                                    <Button
                                        key={count}
                                        type="button"
                                        size="sm"
                                        variant={penaltyShifts === count ? 'default' : 'outline'}
                                        onClick={() => setPenaltyShifts(count)}
                                    >
                                        补 {count} 节
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">
                                选择可补班次
                                <span className="ml-1 font-normal text-muted-foreground">
                                    ({selectedCompKeys.length}/{penaltyShifts})
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
                                                                    'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                                                                    isSelected
                                                                        ? 'border-primary bg-primary/10 text-primary'
                                                                        : 'border-border hover:bg-muted/50'
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

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">
                                请假原因 <span className="font-normal text-muted-foreground">(可选)</span>
                            </Label>
                            <Input
                                placeholder="例如：临时有课程调整"
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-2 border-t pt-2">
                            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
                            <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
                                {isSubmitting ? '提交中...' : '提交待审批请假'}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3 border-t pt-5">
                        <div>
                            <h4 className="text-sm font-semibold">我发起的待审批请假</h4>
                            <p className="text-xs text-muted-foreground">这里可以查看当前状态，并撤回或把定向请求退回大厅。</p>
                        </div>

                        {myPendingLeaves.length === 0 ? (
                            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                当前没有待审批请假。
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {myPendingLeaves.map((leave) => {
                                    const linkedSwap = swapByLeaveId.get(leave.id);
                                    const canReturnToHall = Boolean(linkedSwap?.target_id) && linkedSwap?.status === 'pending';

                                    return (
                                        <div key={leave.id} className="rounded-md border px-3 py-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="space-y-1 text-sm">
                                                    <p className="font-medium">{formatDutySlot(leave.day_of_week, leave.period)}</p>
                                                    <p className="text-muted-foreground">{formatPendingLeaveState(linkedSwap)}</p>
                                                    {leave.reason && (
                                                        <p className="text-xs text-muted-foreground">原因：{leave.reason}</p>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {canReturnToHall && linkedSwap && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={isSwapping}
                                                            onClick={() => rejectSwap(linkedSwap.id)}
                                                        >
                                                            退回大厅
                                                        </Button>
                                                    )}
                                                    {linkedSwap ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-destructive"
                                                            disabled={isSwapping}
                                                            onClick={() => respondToSwap(linkedSwap.id, false)}
                                                        >
                                                            撤回
                                                        </Button>
                                                    ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-destructive"
                                                        disabled={isSwapping}
                                                        onClick={() => deletePendingLeave(leave.id)}
                                                    >
                                                        撤回
                                                    </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                        </>
                    )}

                    {canReview && (
                        <div className="space-y-3 border-t pt-5">
                            <div>
                                <h4 className="text-sm font-semibold">无需代班待审批请假</h4>
                                <p className="text-xs text-muted-foreground">这里只显示没有关联代班请求的待审批请假。</p>
                            </div>

                            {adminPendingDirectLeaves.length === 0 ? (
                                <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                    当前没有待审批的“无需代班”请假。
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {adminPendingDirectLeaves.map((leave) => (
                                        <div key={leave.id} className="rounded-md border px-3 py-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="space-y-1 text-sm">
                                                    <p className="font-medium flex items-center gap-2">
                                                        <UserCircle2 className="h-4 w-4 text-primary" />
                                                        {leave.member?.name || '成员'} · {formatDutySlot(leave.day_of_week, leave.period)}
                                                    </p>
                                                    <p className="text-muted-foreground">等待管理员直接审批</p>
                                                    {leave.reason && (
                                                        <p className="text-xs text-muted-foreground">原因：{leave.reason}</p>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        size="sm"
                                                        disabled={isSwapping}
                                                        onClick={() => approvePendingLeave(leave.id)}
                                                    >
                                                        批准
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-destructive"
                                                        disabled={isSwapping}
                                                        onClick={() => deletePendingLeave(leave.id, {
                                                            title: '已驳回请假',
                                                            description: '该待审批请假与补班安排已清理。'
                                                        })}
                                                    >
                                                        驳回
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
