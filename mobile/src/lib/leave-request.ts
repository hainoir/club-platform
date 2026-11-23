import { isDutyLeaveDateSelectable, listCompensationSlotsForDuty } from '../shared/duty-time.ts';
import type { DutyCompensationSlot } from '../shared/duty-time.ts';

export type LeaveRoster = { day_of_week: number; period: number; member_id: string };
export type ExistingLeave = { member_id?: string; day_of_week: number; period: number; leave_date: string; status: string };

export type LeaveRequest = {
  roster: LeaveRoster | null;
  leaveDate: string;
  penaltyShifts: number;
  selectedSlots: DutyCompensationSlot[];
  existingLeaves: ExistingLeave[];
  memberId: string;
};

const DAYS = ['一', '二', '三', '四', '五'];

export function getCompensationSlotKey(slot: DutyCompensationSlot): string {
  return `${slot.dateKey}-${slot.period}`;
}

export function formatCompensationSlotLabel(slot: DutyCompensationSlot): string {
  const [, month, day] = slot.dateKey.split('-');
  return `${Number(month)}/${Number(day)} 周${DAYS[slot.dayOfWeek - 1]} 第${slot.period}大节`;
}

export function groupCompensationSlots(slots: DutyCompensationSlot[]) {
  return {
    currentWeek: slots.filter((slot) => slot.weekOffset === 0),
    nextWeek: slots.filter((slot) => slot.weekOffset === 1),
  };
}

export function toggleCompensationKey(selected: string[], key: string, max: number): { selected: string[]; error?: string } {
  if (selected.includes(key)) return { selected: selected.filter((item) => item !== key) };
  if (selected.length >= max) return { selected, error: `最多选择 ${max} 个补班节次` };
  return { selected: [...selected, key] };
}

export function validateLeaveRequest({ roster, leaveDate, penaltyShifts, selectedSlots, existingLeaves, memberId }: LeaveRequest): string | null {
  if (!roster || roster.member_id !== memberId) return '请选择班次';
  if (!isDutyLeaveDateSelectable(leaveDate, roster.day_of_week, roster.period)) {
    return '请假日期无效：请选择与值班星期一致、尚未结束且不是节假日的班次日期。';
  }
  if (penaltyShifts !== 1 && penaltyShifts !== 2) return '补班节数只能选择 1 或 2';
  if (existingLeaves.some((leave) =>
    (leave.member_id === undefined || leave.member_id === memberId) &&
    (leave.status === 'pending' || leave.status === 'approved') &&
    leave.day_of_week === roster.day_of_week && leave.period === roster.period && leave.leave_date === leaveDate
  )) return '该日期已经提交过请假';

  const available = new Map(listCompensationSlotsForDuty(
    roster.day_of_week, roster.period, `${leaveDate}T00:00:00+08:00`
  ).map((slot) => [getCompensationSlotKey(slot), slot]));
  const selectedKeys = selectedSlots.map(getCompensationSlotKey);
  if (selectedSlots.length !== penaltyShifts || new Set(selectedKeys).size !== penaltyShifts ||
      selectedSlots.some((slot) => {
        const candidate = available.get(getCompensationSlotKey(slot));
        return !candidate || candidate.dayOfWeek !== slot.dayOfWeek || candidate.weekOffset !== slot.weekOffset;
      })) return `请选择 ${penaltyShifts} 个补班节次`;
  return null;
}

export function buildLeaveInsert({ roster, leaveDate, penaltyShifts, reason, memberId }: {
  roster: LeaveRoster; leaveDate: string; penaltyShifts: number; reason: string; memberId: string;
}) {
  return {
    member_id: memberId,
    day_of_week: roster.day_of_week,
    period: roster.period,
    leave_date: leaveDate,
    reason: reason.trim() || null,
    penalty_shifts: penaltyShifts,
    status: 'pending' as const,
  };
}

export function buildCompensationInserts(leaveId: string, memberId: string, slots: DutyCompensationSlot[]) {
  return slots.map((slot) => ({
    leave_id: leaveId,
    member_id: memberId,
    compensation_date: slot.dateKey,
    day_of_week: slot.dayOfWeek,
    period: slot.period,
  }));
}
