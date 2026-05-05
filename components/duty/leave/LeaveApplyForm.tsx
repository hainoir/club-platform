'use client';

import { useEffect, useMemo, useState } from 'react';

import { Check, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast-simple';
import type { SimpleMember } from '@/components/duty/roster/DutyTable';
import {
    formatCompensationSlotLabel,
    formatDutySlot,
    getCompensationSlotKey,
    getDutySlotKey,
} from './leave-modal-utils';
import { useDuty } from '@/hooks/useDuty';
import { listCompensationSlotsForDuty, type DutyCompensationSlot } from '@/lib/duty/duty-time';
import { cn } from '@/lib/utils';

interface LeaveApplyFormProps {
    dutyManager: ReturnType<typeof useDuty>;
    allMembers: SimpleMember[];
    currentUserId?: string;
    open: boolean;
    onClose: () => void;
}

export function LeaveApplyForm({
    dutyManager,
    allMembers,
    currentUserId,
    open,
    onClose,
}: LeaveApplyFormProps) {
    const { toast } = useToast();
    const { rosters, approvedLeaves, pendingLeaves, submitLeave } = dutyManager;
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
            .filter((leave) => leave.member_id === currentUserId)
            .forEach((leave) => blocked.add(getDutySlotKey(leave.day_of_week, leave.period)));
        return blocked;
    }, [approvedLeaves, currentUserId, pendingLeaves]);

    const myRosters = useMemo(() => (
        rosters
            .filter((roster) => roster.member_id === currentUserId)
            .filter((roster) => !ownBlockedSlots.has(getDutySlotKey(roster.day_of_week, roster.period)))
            .sort((a, b) => (
                a.day_of_week === b.day_of_week
                    ? a.period - b.period
                    : a.day_of_week - b.day_of_week
            ))
    ), [currentUserId, ownBlockedSlots, rosters]);

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
        () => allMembers.filter((member) => member.id !== currentUserId),
        [allMembers, currentUserId]
    );

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
            onClose();
        }
    };

    const canSubmit = Boolean(selectedRosterId) && selectedCompSlots.length === penaltyShifts;

    return (
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
                <Button variant="outline" onClick={onClose}>取消</Button>
                <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? '提交中...' : '提交待审批请假'}
                </Button>
            </div>
        </div>
    );
}
