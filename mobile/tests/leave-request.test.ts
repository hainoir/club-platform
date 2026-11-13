import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextDutyLeaveDateKey, listCompensationSlotsForDuty } from '../src/shared/duty-time.ts';
import {
  buildCompensationInserts, buildLeaveInsert, formatCompensationSlotLabel,
  getCompensationSlotKey, groupCompensationSlots, toggleCompensationKey, validateLeaveRequest,
} from '../src/lib/leave-request.ts';

const memberId = 'member-1';
const roster = { member_id: memberId, day_of_week: 2, period: 1 };
const leaveDate = getNextDutyLeaveDateKey(roster.day_of_week, roster.period);
const slots = listCompensationSlotsForDuty(roster.day_of_week, roster.period, `${leaveDate}T00:00:00+08:00`);
const valid = { roster, leaveDate, penaltyShifts: 1, selectedSlots: [slots[0]], existingLeaves: [], memberId };

test('grouping and labels match web compensation slots', () => {
  const grouped = groupCompensationSlots(slots);
  assert.equal(grouped.currentWeek.length + grouped.nextWeek.length, slots.length);
  assert.ok(grouped.currentWeek.every((slot) => slot.weekOffset === 0));
  assert.ok(grouped.nextWeek.every((slot) => slot.weekOffset === 1));
  assert.equal(getCompensationSlotKey(slots[0]), `${slots[0].dateKey}-${slots[0].period}`);
  assert.match(formatCompensationSlotLabel(slots[0]), /^\d+\/\d+ 周[一二三四五] 第\d+大节$/);
});

test('toggle enforces max and permits deselection', () => {
  const first = getCompensationSlotKey(slots[0]);
  const second = getCompensationSlotKey(slots[1]);
  assert.deepEqual(toggleCompensationKey([], first, 1), { selected: [first] });
  assert.deepEqual(toggleCompensationKey([first], second, 1), { selected: [first], error: '最多选择 1 个补班节次' });
  assert.deepEqual(toggleCompensationKey([first], first, 1), { selected: [] });
});

test('validation covers roster, date, duplicate, penalty and compensation count', () => {
  assert.equal(validateLeaveRequest(valid), null);
  assert.equal(validateLeaveRequest({ ...valid, roster: null }), '请选择班次');
  assert.match(validateLeaveRequest({ ...valid, leaveDate: '2020-01-01' }) ?? '', /^请假日期无效：/);
  assert.equal(validateLeaveRequest({ ...valid, existingLeaves: [{ ...roster, leave_date: leaveDate, status: 'approved' }] }), '该日期已经提交过请假');
  assert.equal(validateLeaveRequest({ ...valid, selectedSlots: [] }), '请选择 1 个补班节次');
  assert.equal(validateLeaveRequest({ ...valid, penaltyShifts: 3 }), '补班节数只能选择 1 或 2');
  assert.equal(validateLeaveRequest({ ...valid, selectedSlots: [slots[0], slots[0]], penaltyShifts: 2 }), '请选择 2 个补班节次');
  assert.equal(validateLeaveRequest({ ...valid, selectedSlots: [{ ...slots[0], dayOfWeek: 5 }] }), '请选择 1 个补班节次');
});

test('row builders produce exact insert shapes', () => {
  assert.deepEqual(buildLeaveInsert({ roster, leaveDate, penaltyShifts: 2, reason: '  调课  ', memberId }), {
    member_id: memberId, day_of_week: 2, period: 1, leave_date: leaveDate,
    reason: '调课', penalty_shifts: 2, status: 'pending',
  });
  assert.deepEqual(buildCompensationInserts('leave-1', memberId, [slots[0]]), [{
    leave_id: 'leave-1', member_id: memberId, compensation_date: slots[0].dateKey,
    day_of_week: slots[0].dayOfWeek, period: slots[0].period,
  }]);
});
