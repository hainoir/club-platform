import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTION_SUPABASE_PROJECT_REF, resolveSupabaseConfig } from '../src/config/supabase-env.ts';

const key = 'public-test-key';
const productionUrl = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;

test('missing URL or key is rejected', () => {
  assert.equal(resolveSupabaseConfig({ anonKey: key }).ok, false);
  assert.deepEqual(resolveSupabaseConfig({ url: 'https://test.supabase.co', anonKey: '  ' }).reason, 'missing');
});

test('URL must be a valid HTTP(S) URL', () => {
  for (const url of ['garbage', 'ftp://test.supabase.co', 'https://']) {
    assert.equal(resolveSupabaseConfig({ url, anonKey: key }).reason, 'invalid-url');
  }
});

test('production ref in host is blocked by default, case-insensitively', () => {
  assert.equal(resolveSupabaseConfig({ url: productionUrl, anonKey: key }).reason, 'production-blocked');
  assert.equal(resolveSupabaseConfig({ url: `https://x-${PRODUCTION_SUPABASE_PROJECT_REF.toUpperCase()}.example.com`, anonKey: key }).reason, 'production-blocked');
});

test('production requires exact true opt-in', () => {
  for (const allowProduction of ['false', 'TRUE', ' true ', '1']) {
    assert.equal(resolveSupabaseConfig({ url: productionUrl, anonKey: key, allowProduction }).reason, 'production-blocked');
  }
  assert.deepEqual(resolveSupabaseConfig({ url: productionUrl, anonKey: key, allowProduction: 'true' }), {
    ok: true, url: productionUrl, anonKey: key, isProduction: true,
  });
});

test('non-production URL and key are trimmed', () => {
  assert.deepEqual(resolveSupabaseConfig({ url: '  http://localhost:54321  ', anonKey: ` ${key} ` }), {
    ok: true, url: 'http://localhost:54321', anonKey: key, isProduction: false,
  });
});

test('production anon key is blocked even behind a non-production URL', () => {
  const payload = Buffer.from(JSON.stringify({ ref: PRODUCTION_SUPABASE_PROJECT_REF, role: 'anon' })).toString('base64url');
  const prodKey = `header.${payload}.signature`;
  const blocked = resolveSupabaseConfig({ url: 'https://proxy.example.com', anonKey: prodKey });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok ? '' : blocked.reason, 'production-blocked');
  const otherPayload = Buffer.from(JSON.stringify({ ref: 'testprojectref', role: 'anon' })).toString('base64url');
  assert.equal(resolveSupabaseConfig({ url: 'https://proxy.example.com', anonKey: `h.${otherPayload}.s` }).ok, true);
});
