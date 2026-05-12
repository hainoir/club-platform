'use client';

import { Check } from 'lucide-react';

import {
    formatCompensationSlotLabel,
    getCompensationSlotKey,
} from './leave-modal-utils';
import type { DutyCompensationSlot } from '@/lib/duty/duty-time';
import { cn } from '@/lib/utils';

interface CompensationSection {
    key: string;
    title: string;
    description: string;
    slots: DutyCompensationSlot[];
}

interface CompensationSlotPickerProps {
    /** 分组后的补班时段（本周/下周） */
    sections: CompensationSection[];
    /** 当前已选中的补班槽位标识列表 */
    selectedKeys: string[];
    /** 需要选择的总数量 */
    requiredCount: number;
    /** 切换选中/取消某个槽位 */
    onToggle: (slot: DutyCompensationSlot) => void;
}

/**
 * 补班槽位选择器
 *
 * 将本周剩余班次和下周全部班次分组展示为可点击的卡片网格，
 * 用户可勾选指定数量的补班节次。
 */
export function CompensationSlotPicker({
    sections,
    selectedKeys,
    requiredCount,
    onToggle,
}: CompensationSlotPickerProps) {
    return (
        <div className="space-y-4">
            {sections.map((section) => (
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
                                const isSelected = selectedKeys.includes(slotKey);

                                return (
                                    <button
                                        key={slotKey}
                                        type="button"
                                        onClick={() => onToggle(slot)}
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
    );
}
