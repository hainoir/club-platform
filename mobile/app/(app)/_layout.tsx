import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';

export default function AppLayout() {
  const { session, loading, signOut } = useAuth();
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (!session) return <Redirect href="/login" />;

  async function logout() {
    try {
      await signOut();
    } catch (cause) {
      Alert.alert('退出失败', cause instanceof Error ? cause.message : '请重试');
    }
  }

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: '#1d4ed8',
      headerStyle: { backgroundColor: '#fff' },
      headerRight: () => <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>退出</Text></Pressable>,
    }}>
      <Tabs.Screen name="duty" options={{ title: '值班', tabBarLabel: '值班' }} />
      <Tabs.Screen name="leave" options={{ title: '请假', tabBarLabel: '请假' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  logout: { paddingHorizontal: 16, paddingVertical: 8 },
  logoutText: { color: '#1d4ed8', fontSize: 15 },
});
