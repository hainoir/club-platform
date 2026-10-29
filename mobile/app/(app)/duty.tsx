import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { slotLabel, type RosterSlot } from '../../src/lib/duty';
import { DUTY_DAYS } from '../../src/shared/duty-constants';

export default function Duty() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RosterSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const result = await supabase.from('duty_rosters')
      .select('*, member:members(id, name, student_id)')
      .order('day_of_week')
      .order('period');
    if (result.error) setError('值班表加载失败，请下拉重试');
    else {
      setRows((result.data || []) as RosterSlot[]);
      setError('');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <View style={styles.page}>
      <Text style={styles.heading}>每周值班表</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListEmptyComponent={<Text style={styles.empty}>{error ? '下拉刷新重试' : '暂无值班安排'}</Text>}
        renderItem={({ item, index }) => (
          <View>
            {index === 0 || rows[index - 1]?.day_of_week !== item.day_of_week ? (
              <Text style={styles.day}>{DUTY_DAYS.find((day) => day.id === item.day_of_week)?.label ?? '值班'}</Text>
            ) : null}
            <View style={[styles.card, item.member_id === user?.id && styles.mine]}>
              <Text style={styles.slot}>{slotLabel(item.day_of_week, item.period)}</Text>
              <Text style={styles.member}>
                {item.member?.name || '未命名成员'}{item.member?.student_id ? ` · ${item.member.student_id}` : ''}
                {item.member_id === user?.id ? '  我的' : ''}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16 },
  center: { flex: 1, justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginTop: 20, marginBottom: 8 },
  day: { fontSize: 17, fontWeight: '700', color: '#334155', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  mine: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  slot: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  member: { fontSize: 15, color: '#475569', marginTop: 6 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 50 },
  error: { color: '#b91c1c', marginTop: 12 },
});
