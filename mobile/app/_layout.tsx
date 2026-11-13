import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { AuthProvider } from '../src/auth/AuthContext';
import { supabaseConfig } from '../src/lib/supabase';

export default function RootLayout() {
  if (!supabaseConfig.ok) {
    return (
      <View style={styles.errorPage}>
        <StatusBar style="dark" />
        <Text style={styles.title}>{supabaseConfig.reason === 'production-blocked' ? '已阻止连接生产数据库' : '无法启动：Supabase 配置无效'}</Text>
        <Text style={styles.message}>{supabaseConfig.message}</Text>
      </View>
    );
  }
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  errorPage: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', color: '#b91c1c', marginBottom: 12 },
  message: { fontSize: 16, lineHeight: 24, color: '#334155' },
});
