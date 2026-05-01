import { DutyManagementOverview } from '@/components/duty/DutyManagementOverview';
import { RosterWithMember } from '@/hooks/useDuty';
import { getDutyWeekMondayDateKey } from '@/lib/duty-time';
import { EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER } from '@/lib/keyTransferFilters';
import { createClient } from '@/utils/supabase/server';
import { resolveAppUser } from '@/utils/supabase/resolve-app-user';

import DutyClient from './DutyClient';

export const dynamic = 'force-dynamic';

export default async function DutyPage() {
    const supabase = await createClient();
    const now = new Date();
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
            .select('*, member:members(id, name, student_id)'),
        supabase
            .from('members')
            .select('id, name, student_id')
            .eq('status', 'active')
            .order('name'),
        supabase
            .from('duty_leaves')
            .select('id, member_id, day_of_week, period, status')
            .eq('status', 'approved'),
        supabase
            .from('duty_leaves')
            .select('id, member_id, day_of_week, period, created_at, status')
            .eq('status', 'pending'),
        supabase
            .from('duty_logs')
            .select('member_id, sign_in_time, sign_in_date, location_verified')
            .gte('sign_in_date', mondayDateKey)
            .eq('location_verified', true),
        supabase
            .from('events')
            .select('id, title, event_date')
            .gt('event_date', now.toISOString())
            .order('event_date', { ascending: true })
            .limit(1),
        supabase.from('duty_swaps').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('target_id', null),
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
                .or(EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER),
            supabase
                .from('duty_swaps')
                .select('id', { count: 'exact', head: true })
                .in('status', ['pending', 'accepted'])
                .or(`requester_id.eq.${me.id},target_id.eq.${me.id}`),
        ]);

        pendingKeyForMe = keyCount || 0;
        myRelatedSwapCount = swapCount || 0;
    }

    const rosterList = (rosters || []) as unknown as RosterWithMember[];
    const approvedLeaves = (approvedLeavesData || []) as Array<{
        id: string;
        member_id: string;
        day_of_week: number;
        period: number;
        status: string | null;
    }>;
    const pendingLeaves = (pendingLeavesData || []) as Array<{
        id: string;
        member_id: string;
        day_of_week: number;
        period: number;
        created_at: string;
        status: string | null;
    }>;
    const weekLogs = (weekLogsData || []) as Array<{
        member_id: string;
        sign_in_time: string;
        sign_in_date: string | null;
        location_verified: boolean | null;
    }>;
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
