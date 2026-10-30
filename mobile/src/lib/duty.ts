import { DUTY_DAYS, DUTY_PERIODS } from '../shared/duty-constants';

export type RosterSlot = {
  id: string;
  member_id: string;
  day_of_week: number;
  period: number;
  member?: { id: string; name: string | null; student_id: string | null } | null;
};

export function slotLabel(day: number, period: number) {
  const dayName = DUTY_DAYS.find((item) => item.id === day)?.label ?? `周${day}`;
  const periodName = DUTY_PERIODS.find((item) => item.id === period)?.fullLabel ?? `第${period}节`;
  return `${dayName} · ${periodName}`;
}
