import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { slotLabel, type RosterSlot } from '../../src/lib/duty';
import { getNextDutyLeaveDateKey, isDutyLeaveDateSelectable } from '../../src/shared/duty-time';

type PendingLeave = {
  id: string;
  day_of_week: number;
  period: number;
  leave_date: string;
};

export default function Leave() {
  const { user } = useAuth();
  const [slots, setSlots] = useState<RosterSlot[]>([]);
  const [pending, setPending] = useState<PendingLeave[]>([]);
  const [selected, setSelected] = useState<RosterSlot | null>(null);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [rosters, leaves] = await Promise.all([
      supabase.from('duty_rosters')
        .select('id, member_id, day_of_week, period')
        .eq('member_id', user.id)
        .order('day_of_week')
        .order('period'),
      supabase.from('duty_leaves')
        .select('id, day_of_week, period, leave_date')
        .eq('member_id', user.id)
        .eq('status', 'pending')
        .order('leave_date'),
    ]);
    if (rosters.error || leaves.error) {
      setError('请假信息加载失败，请稍后重试');
    } else {
      setSlots((rosters.data || []) as RosterSlot[]);
      setPending((leaves.data || []) as PendingLeave[]);
      setError('');
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  function selectSlot(slot: RosterSlot) {
    setSelected(slot);
    setDate(getNextDutyLeaveDateKey(slot.day_of_week, slot.period));
    setError('');
  }

  async function submit() {
    if (submitting || !user || !selected) return;
    const leaveDate = date.trim();
    if (!isDutyLeaveDateSelectable(leaveDate, selected.day_of_week, selected.period)) {
      setError('日期无效：请选择该排班对应且尚未结束的值班日，格式为 YYYY-MM-DD');
      return;
    }

    setSubmitting(true);
    setError('');
    const { error: insertError } = await supabase.from('duty_leaves').insert({
      member_id: user.id,
      day_of_week: selected.day_of_week,
      period: selected.period,
      leave_date: leaveDate,
      reason: reason.trim() || null,
      penalty_shifts: 1,
      status: 'pending',
    });
    setSubmitting(false);
    if (insertError) {
      setError('提交失败，请联系管理员确认请假规则后重试');
      return;
    }
    setReason('');
    Alert.alert('提交成功', '请假申请已提交，等待管理员处理');
    await load();
  }

  if (loading && !slots.length) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>申请请假</Text>
      <Text style={styles.hint}>选择排班，再填写请假日期和原因。</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error && !slots.length ? <Pressable onPress={() => void load()}><Text style={styles.retry}>重试加载</Text></Pressable> : null}
      {!slots.length && error ? null : !slots.length ? (
        <Text style={styles.empty}>你还没有排班，请联系管理员</Text>
      ) : (
        <>
          <Text style={styles.label}>我的排班</Text>
          {slots.map((slot) => (
            <Pressable key={slot.id} onPress={() => selectSlot(slot)} style={[styles.slot, selected?.id === slot.id && styles.selected]}>
              <Text style={styles.slotText}>{slotLabel(slot.day_of_week, slot.period)}</Text>
              <Text style={styles.radio}>{selected?.id === slot.id ? '已选择' : '选择'}</Text>
            </Pressable>
          ))}
          {selected ? (
            <>
              <Text style={styles.label}>请假日期</Text>
              <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
              <Text style={styles.hint}>按中国标准时间判断；法定节假日不可申请。</Text>
              <Text style={styles.label}>原因（选填）</Text>
              <TextInput style={[styles.input, styles.reason]} value={reason} onChangeText={setReason} placeholder="请填写请假原因" multiline textAlignVertical="top" />
              <Pressable style={[styles.button, submitting && styles.disabled]} onPress={submit} disabled={submitting}>
                <Text style={styles.buttonText}>{submitting ? '提交中…' : '提交请假申请'}</Text>
              </Pressable>
            </>
          ) : null}
        </>
      )}
      <Text style={styles.pendingTitle}>待处理申请</Text>
      {pending.length ? pending.map((leave) => (
        <Text key={leave.id} style={styles.pendingRow}>{leave.leave_date} · {slotLabel(leave.day_of_week, leave.period)}</Text>
      )) : <Text style={styles.hint}>暂无待处理申请</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  hint: { color: '#64748b', fontSize: 14, marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '600', color: '#334155', marginTop: 16, marginBottom: 10 },
  slot: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', marginBottom: 8 },
  selected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  slotText: { fontSize: 15, color: '#0f172a' },
  radio: { color: '#1d4ed8' },
  input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  reason: { minHeight: 96 },
  button: { backgroundColor: '#1d4ed8', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 20 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#b91c1c', marginTop: 12 },
  retry: { color: '#1d4ed8', marginTop: 12, fontSize: 15 },
  empty: { color: '#64748b', marginTop: 24 },
  pendingTitle: { fontSize: 18, fontWeight: '700', marginTop: 32, marginBottom: 12, color: '#334155' },
  pendingRow: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, color: '#334155' },
});
