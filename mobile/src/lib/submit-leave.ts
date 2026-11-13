import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCompensationInserts, buildLeaveInsert, validateLeaveRequest } from './leave-request.ts';
import type { LeaveRequest } from './leave-request.ts';

export type SubmitLeaveArgs = LeaveRequest & { reason: string };

export async function submitLeaveRequest(client: SupabaseClient, args: SubmitLeaveArgs): Promise<{ ok: true } | { ok: false; message: string }> {
  const leaveDate = args.leaveDate.trim();
  const request = { ...args, leaveDate };
  const validationError = validateLeaveRequest(request);
  if (validationError) return { ok: false, message: validationError };
  const roster = request.roster;
  if (!roster) return { ok: false, message: '请选择班次' };

  let leaveId: string | null = null;
  try {
    const { data, error } = await client.from('duty_leaves')
      .insert(buildLeaveInsert({ roster, leaveDate, penaltyShifts: args.penaltyShifts, reason: args.reason, memberId: args.memberId }))
      .select('id').single();
    if (error || !data?.id) throw error || new Error('请假记录创建失败');
    leaveId = data.id;

    const compensationRows = buildCompensationInserts(data.id, args.memberId, args.selectedSlots);
    const { error: compensationError } = await client.from('duty_compensations').insert(compensationRows);
    if (compensationError) throw compensationError;
    return { ok: true };
  } catch {
    if (leaveId) {
      try {
        const { error: rollbackError } = await client.from('duty_leaves').delete().eq('id', leaveId).eq('status', 'pending');
        if (rollbackError) throw rollbackError;
      } catch {
        return { ok: false, message: '提交失败，且请假记录撤回失败；请联系管理员检查待审批申请。' };
      }
    }
    return { ok: false, message: '提交失败，请联系管理员确认请假和补班规则后重试。' };
  }
}
