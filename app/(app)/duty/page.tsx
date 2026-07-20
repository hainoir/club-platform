import { DutyManagementOverview } from '@/components/duty/overview/DutyManagementOverview';
import type { SimpleMember } from '@/components/duty/roster/DutyTable';
import type { RosterWithMember } from '@/hooks/useDuty';
import { getDutyWeekMondayDateKey } from '@/lib/duty/duty-time';
import { EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER } from '@/lib/duty/keyTransferFilters';
import type { Database } from '@/types/supabase';
import { createClient } from '@/utils/supabase/server';
import { resolveAppUser } from '@/utils/supabase/resolve-app-user';

import DutyClient from '@/components/duty/DutyClient';

export const dynamic = 'force-dynamic';

type DutyLeaveSlotSummary = Pick<Database['public']['Tables']['duty_leaves']['Row'], 'id' | 'member_id' | 'day_of_week' | 'period' | 'status'>;
type DutyLeaveSummary = DutyLeaveSlotSummary & Pick<Database['public']['Tables']['duty_leaves']['Row'], 'leave_date' | 'expires_at'>;
type PendingDutyLeaveSummary = DutyLeaveSlotSummary & Pick<Database['public']['Tables']['duty_leaves']['Row'], 'created_at'>;
type DutyLogSummary = Pick<Database['public']['Tables']['duty_logs']['Row'], 'member_id' | 'sign_in_time' | 'sign_in_date' | 'location_verified'>;
type UpcomingEventSummary = Pick<Database['public']['Tables']['events']['Row'], 'id' | 'title' | 'event_date'>;
type DutySwapId = Pick<Database['public']['Tables']['duty_swaps']['Row'], 'id'>;
type KeyTransferId = Pick<Database['public']['Tables']['key_transfers']['Row'], 'id'>;

export default async function DutyPage() {
    const supabase = await createClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const mondayDateKey = getDutyWeekMondayDateKey(now);

    const [
        { data: rosters, error },
        { data: members, error: membersError },
        { data: approvedLeavesData },
        { data: pendingLeavesData },
        { data: weekLogsData },
        { data: upcomingEventData },
        { count: pendingSwapCount },
        {
            data: { user: authUser },
        },
    ] = await Promise.all([
        supabase
            .from('duty_rosters')
            .select('*, member:members(id, name, student_id)')
            .returns<RosterWithMember[]>(),
        supabase
            .from('members')
            .select('id, name, student_id')
            .eq('status', 'active')
            .order('name')
            .returns<SimpleMember[]>(),
        supabase
            .from('duty_leaves')
            .select('id, member_id, day_of_week, period, leave_date, expires_at, status')
            .eq('status', 'approved')
            .gt('expires_at', nowIso)
            .returns<DutyLeaveSummary[]>(),
        supabase
            .from('duty_leaves')
            .select('id, member_id, day_of_week, period, created_at, status')
            .eq('status', 'pending')
            .gt('expires_at', nowIso)
            .returns<PendingDutyLeaveSummary[]>(),
        supabase
            .from('duty_logs')
            .select('member_id, sign_in_time, sign_in_date, location_verified')
            .gte('sign_in_date', mondayDateKey)
            .eq('location_verified', true)
            .returns<DutyLogSummary[]>(),
        supabase
            .from('events')
            .select('id, title, event_date')
            .gt('event_date', now.toISOString())
            .order('event_date', { ascending: true })
            .limit(1)
            .returns<UpcomingEventSummary[]>(),
        supabase
            .from('duty_swaps')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .is('target_id', null)
            .returns<DutySwapId[]>(),
        supabase.auth.getUser(),
    ]);

    if (error) {
        console.error('获取排班数据失败:', error);
    }

    if (membersError) {
        console.error('获取成员列表失败:', membersError);
    }

    const me = await resolveAppUser(supabase, authUser);
    let pendingKeyForMe = 0;
    let myRelatedSwapCount = 0;

    if (me?.id) {
        const [{ count: keyCount }, { count: swapCount }] = await Promise.all([
            supabase
                .from('key_transfers')
                .select('id', { count: 'exact', head: true })
                .eq('to_member_id', me.id)
                .eq('status', 'pending')
                .or(EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER)
                .returns<KeyTransferId[]>(),
            supabase
                .from('duty_swaps')
                .select('id', { count: 'exact', head: true })
                .in('status', ['pending', 'accepted'])
                .or(`requester_id.eq.${me.id},target_id.eq.${me.id}`)
                .returns<DutySwapId[]>(),
        ]);

        pendingKeyForMe = keyCount || 0;
        myRelatedSwapCount = swapCount || 0;
    }

    const rosterList = rosters || [];
    const approvedLeaves = approvedLeavesData || [];
    const pendingLeaves = pendingLeavesData || [];
    const weekLogs = weekLogsData || [];
    const upcomingEvent = upcomingEventData?.[0] || null;

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <DutyClient
                initialData={rosterList}
                initialMembers={members || []}
            />
            <DutyManagementOverview
                rosters={rosterList}
                approvedLeaves={approvedLeaves}
                pendingLeaves={pendingLeaves}
                weekLogs={weekLogs}
                currentMemberId={me?.id || null}
                pendingSwapCount={pendingSwapCount || 0}
                myRelatedSwapCount={myRelatedSwapCount}
                pendingKeyForMe={pendingKeyForMe}
                upcomingEvent={upcomingEvent}
            />
        </div>
    );
}
