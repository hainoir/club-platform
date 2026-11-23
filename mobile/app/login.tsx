import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';

export default function Login() {
  const router = useRouter();
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (session) return <Redirect href="/duty" />;

  async function submit() {
    if (submitting) return;
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace('/duty');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>社团值班</Text>
      <Text style={styles.subtitle}>登录后查看排班和申请请假</Text>
      <Text style={styles.label}>邮箱</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="请输入邮箱" />
      <Text style={styles.label}>密码</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="请输入密码" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, submitting && styles.disabled]} onPress={submit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? '登录中…' : '登录'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 8, marginBottom: 30 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#334155' },
  input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 16 },
  error: { color: '#b91c1c', marginBottom: 16 },
  button: { backgroundColor: '#1d4ed8', borderRadius: 10, padding: 16, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
