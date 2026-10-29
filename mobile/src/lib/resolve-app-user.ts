import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js';
import {
  DEFAULT_MEMBER_ROLE,
  isAdminRole,
  normalizeUserRole,
  type AppUser,
} from '../shared/app-user';

type MemberLookupRow = {
  id: string;
  role: string | null;
  name: string | null;
  created_at: string;
};

function pickPreferredMember(candidates: MemberLookupRow[], authUserId: string): MemberLookupRow | null {
  const exact = candidates.find((candidate) => candidate.id === authUserId);
  if (exact) return exact;
  return [...candidates].sort((left, right) => {
    const roleDifference = Number(isAdminRole(right.role)) - Number(isAdminRole(left.role));
    if (roleDifference) return roleDifference;
    return (Date.parse(right.created_at || '') || 0) - (Date.parse(left.created_at || '') || 0);
  })[0] ?? null;
}

export function fallbackAppUser(authUser: SupabaseAuthUser): AppUser {
  return {
    id: authUser.id,
    email: authUser.email || '',
    role: DEFAULT_MEMBER_ROLE,
    name: typeof authUser.user_metadata?.name === 'string' ? authUser.user_metadata.name : undefined,
  };
}

export async function resolveAppUser(
  client: SupabaseClient,
  authUser: SupabaseAuthUser | null | undefined,
): Promise<AppUser | null> {
  if (!authUser) return null;
  const fallback = fallbackAppUser(authUser);

  try {
    let member: MemberLookupRow | null = null;
    const byId = await client.from('members').select('id, role, name, created_at').eq('id', authUser.id).maybeSingle();
    if (byId.data) member = byId.data as MemberLookupRow;

    if (!member && authUser.email) {
      const byEmail = await client.from('members')
        .select('id, role, name, created_at')
        .ilike('email', authUser.email)
        .order('created_at', { ascending: false })
        .limit(20);
      member = pickPreferredMember((byEmail.data || []) as MemberLookupRow[], authUser.id);
    }

    if (!member) return fallback;
    return {
      id: member.id,
      email: authUser.email || '',
      role: normalizeUserRole(member.role),
      name: member.name ?? undefined,
    };
  } catch {
    return fallback;
  }
}
