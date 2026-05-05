import type { SupabaseClient } from '@supabase/supabase-js';

import type { AppUser } from '@/lib/app-user';
import type { Database } from '@/types/supabase';

type DutyRoster = Database['public']['Tables']['duty_rosters']['Row'];
type DutySwap = Database['public']['Tables']['duty_swaps']['Row'];
type DutyLeave = Database['public']['Tables']['duty_leaves']['Row'];
type KeyTransfer = Database['public']['Tables']['key_transfers']['Row'];
type Member = Database['public']['Tables']['members']['Row'];

// 【学习注释：前端展示类型整形】
// 数据库原表结构偏向存储，而页面渲染需要直接拿到成员信息，所以这里先把联表后的展示类型定义清楚。
export interface RosterWithMember extends DutyRoster {
    member: Pick<Member, 'id' | 'name' | 'student_id'>;
}

export interface SwapWithMember extends DutySwap {
    requester: Pick<Member, 'id' | 'name'>;
    target?: Pick<Member, 'id' | 'name'> | null;
}

export interface LeaveWithMember extends DutyLeave {
    member: Pick<Member, 'id' | 'name'> | null;
}

export interface KeyTransferWithMember extends KeyTransfer {
    from_member?: Pick<Member, 'id' | 'name'> | null;
    to_member?: Pick<Member, 'id' | 'name'> | null;
}

export type DutySupabaseClient = SupabaseClient<Database>;
export type DutyUser = AppUser | null;
export type DutyToast = (toast: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive';
}) => void;
export type EnsureActiveSession = () => Promise<boolean>;
export type RefreshCallback = () => void | Promise<void>;

export interface DutyHookContext {
    supabase: DutySupabaseClient;
    user: DutyUser;
    toast: DutyToast;
    ensureActiveSession: EnsureActiveSession;
}

// 【学习注释：展示层星期文案】
// 业务逻辑里保留数字更稳定，真正渲染给用户前再转换成中文标签。
export const DAYS_LABEL = ['一', '二', '三', '四', '五'];
