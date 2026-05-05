import type { DutyCompensationSlot } from '@/lib/duty-time';

const DAYS = ['一', '二', '三', '四', '五'];

export interface PendingLeaveSwapDisplay {
    status: string | null;
    target_id: string | null;
    target?: { name: string } | null;
}

export function getCompensationSlotKey(slot: DutyCompensationSlot) {
    return `${slot.dateKey}-${slot.period}`;
}

export function getDutySlotKey(dayOfWeek: number, period: number) {
    return `${dayOfWeek}-${period}`;
}

export function formatDutySlot(dayOfWeek: number, period: number) {
    return `周${DAYS[dayOfWeek - 1]} 第${period}大节`;
}

export function formatCompensationSlotLabel(slot: DutyCompensationSlot) {
    const [, month, day] = slot.dateKey.split('-');
    return `${Number(month)}/${Number(day)} 周${DAYS[slot.dayOfWeek - 1]} 第${slot.period}大节`;
}

export function formatPendingLeaveState(swap: PendingLeaveSwapDisplay | undefined) {
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
