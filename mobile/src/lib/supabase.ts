import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from '../config/supabase-env';

export const supabaseConfig = resolveSupabaseConfig({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  allowProduction: process.env.EXPO_PUBLIC_ALLOW_PRODUCTION_SUPABASE,
});

export const supabase: SupabaseClient = supabaseConfig.ok
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : new Proxy({} as SupabaseClient, {
      get() { throw new Error(supabaseConfig.message); },
    });
