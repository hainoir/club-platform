import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { slotLabel, type RosterSlot } from '../../src/lib/duty';
import {
  formatCompensationSlotLabel, getCompensationSlotKey, groupCompensationSlots,
  toggleCompensationKey, validateLeaveRequest, type ExistingLeave,
} from '../../src/lib/leave-request';
import { submitLeaveRequest } from '../../src/lib/submit-leave';
import { getNextDutyLeaveDateKey, isDutyLeaveDateSelectable, listCompensationSlotsForDuty } from '../../src/shared/duty-time.ts';

type MemberLeave = ExistingLeave & { id: string };

export default function Leave() {
  const { user } = useAuth();
  const [slots, setSlots] = useState<RosterSlot[]>([]);
  const [leaves, setLeaves] = useState<MemberLeave[]>([]);
  const [selected, setSelected] = useState<RosterSlot | null>(null);
  const [date, setDate] = useState('');
  const [penaltyShifts, setPenaltyShifts] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [rosters, leaveResults] = await Promise.all([
        supabase.from('duty_rosters')
          .select('id, member_id, day_of_week, period')
          .eq('member_id', user.id)
          .order('day_of_week').order('period'),
        supabase.from('duty_leaves')
          .select('id, day_of_week, period, leave_date, status')
          .eq('member_id', user.id)
          .in('status', ['pending', 'approved'])
          .order('leave_date'),
      ]);
      if (rosters.error || leaveResults.error) throw rosters.error || leaveResults.error;
      setSlots((rosters.data || []) as RosterSlot[]);
      setLeaves((leaveResults.data || []) as MemberLeave[]);
      setLoadFailed(false);
      setError('');
    } catch {
      setLoadFailed(true);
      setError('请假信息加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const compensationSlots = useMemo(() => selected && isDutyLeaveDateSelectable(date.trim(), selected.day_of_week, selected.period)
    ? listCompensationSlotsForDuty(selected.day_of_week, selected.period, `${date.trim()}T00:00:00+08:00`)
    : [], [selected, date]);
  const groupedSlots = useMemo(() => groupCompensationSlots(compensationSlots), [compensationSlots]);
  const selectedSlots = useMemo(() => {
    const byKey = new Map(compensationSlots.map((slot) => [getCompensationSlotKey(slot), slot]));
    return selectedKeys.flatMap((key) => {
      const slot = byKey.get(key);
      return slot ? [slot] : [];
    });
  }, [compensationSlots, selectedKeys]);
  useEffect(() => {
    const availableKeys = new Set(compensationSlots.map(getCompensationSlotKey));
    setSelectedKeys((keys) => {
      const next = keys.filter((key) => availableKeys.has(key)).slice(0, penaltyShifts);
      return next.length === keys.length && next.every((key, index) => key === keys[index]) ? keys : next;
    });
  }, [compensationSlots, penaltyShifts]);
  const validationError = user ? validateLeaveRequest({
    roster: selected, leaveDate: date.trim(), penaltyShifts, selectedSlots,
    existingLeaves: leaves, memberId: user.id,
  }) : '请选择班次';
  const canSubmit = !loading && !loadFailed && !submitting && validationError === null;
  const pending = leaves.filter((leave) => leave.status === 'pending');

  function selectSlot(slot: RosterSlot) {
    setSelected(slot);
    setDate(getNextDutyLeaveDateKey(slot.day_of_week, slot.period));
    setSelectedKeys([]);
    setError('');
  }

  function changeDate(value: string) {
    setDate(value);
    setSelectedKeys([]);
    setError('');
  }

  function changePenalty(count: number) {
    setPenaltyShifts(count);
    setSelectedKeys((keys) => keys.slice(0, count));
    setError('');
  }

  function toggleSlot(key: string) {
    const result = toggleCompensationKey(selectedKeys, key, penaltyShifts);
    setSelectedKeys(result.selected);
    setError(result.error || '');
  }

  async function submit() {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await submitLeaveRequest(supabase, {
        roster: selected, leaveDate: date, penaltyShifts, selectedSlots,
        existingLeaves: leaves, memberId: user.id, reason,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReason('');
      setSelectedKeys([]);
      Alert.alert('提交成功', '请假申请已提交，等待管理员处理');
      await load();
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !slots.length) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>申请请假</Text>
      <Text style={styles.hint}>选择自己的排班，并安排 1 或 2 节补班。</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loadFailed ? <Pressable onPress={() => void load()}><Text style={styles.retry}>重试加载</Text></Pressable> : null}
      {!slots.length && !loadFailed ? <Text style={styles.empty}>你还没有排班，请联系管理员</Text> : null}
      {slots.length > 0 && (
        <>
          <Text style={styles.label}>我的排班</Text>
          {slots.map((slot) => (
            <Pressable key={slot.id} onPress={() => selectSlot(slot)} style={[styles.slot, selected?.id === slot.id && styles.selected]}>
              <Text style={styles.slotText}>{slotLabel(slot.day_of_week, slot.period)}</Text>
              <Text style={styles.radio}>{selected?.id === slot.id ? '已选择' : '选择'}</Text>
            </Pressable>
          ))}
          {selected && (
            <>
              <Text style={styles.label}>请假日期</Text>
              <TextInput style={styles.input} value={date} onChangeText={changeDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
              <Text style={styles.hint}>日期须与排班星期一致，且班次尚未结束、不是法定节假日。</Text>
              {validationError?.startsWith('请假日期无效') || validationError === '该日期已经提交过请假'
                ? <Text style={styles.error}>{validationError}</Text> : null}
              <Text style={styles.label}>补班节数</Text>
              <View style={styles.penaltyRow}>
                {[1, 2].map((count) => (
                  <Pressable key={count} onPress={() => changePenalty(count)} style={[styles.penaltyButton, penaltyShifts === count && styles.selected]}>
                    <Text style={styles.radio}>补 {count} 节</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>选择可补班次（{selectedSlots.length}/{penaltyShifts}）</Text>
              {([
                { title: '请假当周剩余班次', slots: groupedSlots.currentWeek },
                { title: '请假次周所有班次', slots: groupedSlots.nextWeek },
              ] as const).map((section) => (
                <View key={section.title}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.slots.length ? section.slots.map((slot) => {
                    const key = getCompensationSlotKey(slot);
                    const checked = selectedKeys.includes(key);
                    return (
                      <Pressable key={key} onPress={() => toggleSlot(key)} style={[styles.slot, checked && styles.selected]}>
                        <Text style={styles.slotText}>{formatCompensationSlotLabel(slot)}</Text>
                        <Text style={styles.radio}>{checked ? '✓ 已选择' : '选择'}</Text>
                      </Pressable>
                    );
                  }) : <Text style={styles.hint}>当前没有可补班次</Text>}
                </View>
              ))}
              <Text style={styles.label}>原因（选填）</Text>
              <TextInput style={[styles.input, styles.reason]} value={reason} onChangeText={setReason} placeholder="请填写请假原因" multiline textAlignVertical="top" />
              <Pressable style={[styles.button, !canSubmit && styles.disabled]} onPress={() => void submit()} disabled={!canSubmit}>
                <Text style={styles.buttonText}>{submitting ? '提交中…' : '提交请假申请'}</Text>
              </Pressable>
            </>
          )}
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
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#475569', marginTop: 12, marginBottom: 8 },
  penaltyRow: { flexDirection: 'row', gap: 8 },
  penaltyButton: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
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
