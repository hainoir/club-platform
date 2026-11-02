import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { resolveAppUser } from '../lib/resolve-app-user';
import type { AppUser } from '../shared/app-user';

type AuthValue = {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      if (active) {
        setSession(nextSession);
        setInitialized(true);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || receivedAuthEvent) return;
      setSession(error ? null : data.session);
      setInitialized(true);
    }).catch(() => {
      if (active && !receivedAuthEvent) setInitialized(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    let active = true;
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    resolveAppUser(supabase, session.user).then((resolved) => {
      if (active) setUser(resolved);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [initialized, session?.user.id, session?.access_token]);

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) throw new Error('登录失败，请检查邮箱和密码');
    setSession(data.session);
    setInitialized(true);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error('退出失败，请重试');
    setSession(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}
