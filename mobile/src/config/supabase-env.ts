export const PRODUCTION_SUPABASE_PROJECT_REF = 'qpdbjizsccvebfqozmal';

export type SupabaseEnvInput = { url?: string; anonKey?: string; allowProduction?: string };

export type SupabaseConfig =
  | { ok: true; url: string; anonKey: string; isProduction: boolean }
  | { ok: false; reason: 'missing' | 'production-blocked' | 'invalid-url'; message: string };

// Legacy anon keys are JWTs whose payload carries the project ref, so a proxy or
// custom domain in front of production is still caught by the key itself.
export function readAnonKeyProjectRef(anonKey: string): string | null {
  const payload = anonKey.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const ref = (JSON.parse(atob(base64)) as { ref?: unknown }).ref;
    return typeof ref === 'string' ? ref : null;
  } catch {
    return null;
  }
}

const SETUP_HINT = '请检查 EXPO_PUBLIC_SUPABASE_URL、EXPO_PUBLIC_SUPABASE_ANON_KEY 和 EXPO_PUBLIC_ALLOW_PRODUCTION_SUPABASE；参见 mobile/README.md。';

export function resolveSupabaseConfig(input: SupabaseEnvInput): SupabaseConfig {
  const url = input.url?.trim() ?? '';
  const anonKey = input.anonKey?.trim() ?? '';
  if (!url || !anonKey) {
    return {
      ok: false,
      reason: 'missing',
      message: `请在 mobile/.env 或构建环境中配置测试/本地项目的 URL 和 anon key。${SETUP_HINT}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      reason: 'invalid-url',
      message: `EXPO_PUBLIC_SUPABASE_URL 必须是有效的 http(s) URL。${SETUP_HINT}`,
    };
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    return {
      ok: false,
      reason: 'invalid-url',
      message: `EXPO_PUBLIC_SUPABASE_URL 必须是有效的 http(s) URL。${SETUP_HINT}`,
    };
  }

  const isProduction = parsed.hostname.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF)
    || readAnonKeyProjectRef(anonKey)?.toLowerCase() === PRODUCTION_SUPABASE_PROJECT_REF;
  if (isProduction && input.allowProduction !== 'true') {
    return {
      ok: false,
      reason: 'production-blocked',
      message: `已阻止连接生产数据库。请改用测试/本地项目；只有经授权需要连接生产时，才将 EXPO_PUBLIC_ALLOW_PRODUCTION_SUPABASE 精确设为 true。${SETUP_HINT}`,
    };
  }
  return { ok: true, url, anonKey, isProduction };
}
