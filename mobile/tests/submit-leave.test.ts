import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNextDutyLeaveDateKey, listCompensationSlotsForDuty } from '../src/shared/duty-time.ts';
import { submitLeaveRequest } from '../src/lib/submit-leave.ts';

const roster = { member_id: 'member-1', day_of_week: 2, period: 1 };
const leaveDate = getNextDutyLeaveDateKey(roster.day_of_week, roster.period);
const selectedSlots = listCompensationSlotsForDuty(2, 1, `${leaveDate}T00:00:00+08:00`).slice(0, 1);
const args = { roster, leaveDate, penaltyShifts: 1, selectedSlots, existingLeaves: [], memberId: 'member-1', reason: '' };

function fakeClient(compensationError: boolean, rollbackError = false) {
  const calls: unknown[] = [];
  const client = {
    from(table: string) {
      if (table === 'duty_leaves') return {
        insert(row: unknown) {
          calls.push(['leave-insert', row]);
          return { select(column: string) {
            calls.push(['select', column]);
            return { async single() { return { data: { id: 'leave-1' }, error: null }; } };
          } };
        },
        delete() {
          calls.push(['leave-delete']);
          return { eq(column: string, value: string) {
            calls.push(['eq', column, value]);
            return { eq(statusColumn: string, status: string) {
              calls.push(['eq', statusColumn, status]);
              return Promise.resolve({ error: rollbackError ? new Error('rollback denied') : null });
            } };
          } };
        },
      };
      if (table === 'duty_compensations') return {
        insert(rows: unknown) {
          calls.push(['compensation-insert', rows]);
          return Promise.resolve({ error: compensationError ? new Error('insert denied') : null });
        },
      };
      throw new Error(`Unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('successful submission creates leave then compensations', async () => {
  const { client, calls } = fakeClient(false);
  assert.deepEqual(await submitLeaveRequest(client, args), { ok: true });
  assert.deepEqual(calls.map((call) => (call as string[])[0]), ['leave-insert', 'select', 'compensation-insert']);
});

test('compensation failure rolls back pending leave by id and status', async () => {
  const { client, calls } = fakeClient(true);
  const result = await submitLeaveRequest(client, args);
  assert.equal(result.ok, false);
  assert.deepEqual(calls.slice(-3), [['leave-delete'], ['eq', 'id', 'leave-1'], ['eq', 'status', 'pending']]);
});

test('rollback failure is reported explicitly', async () => {
  const { client } = fakeClient(true, true);
  const result = await submitLeaveRequest(client, args);
  assert.deepEqual(result, { ok: false, message: '提交失败，且请假记录撤回失败；请联系管理员检查待审批申请。' });
});
