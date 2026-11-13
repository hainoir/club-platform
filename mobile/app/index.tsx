import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  return <Redirect href={session ? '/duty' : '/login'} />;
}

const styles = StyleSheet.create({ center: { flex: 1, justifyContent: 'center' } });
