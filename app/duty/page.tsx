import { createClient } from '@/utils/supabase/server';
import DutyClient from './DutyClient';
import { RosterWithMember } from '@/hooks/useDuty';

export const dynamic = 'force-dynamic';

export default async function DutyPage() {
    const supabase = await createClient();

    // 预取排班数据
    const { data: rosters, error } = await supabase
        .from('duty_rosters')
        .select('*, member:members(id, name, student_id)');

    if (error) {
        console.error('获取排班数据失败:', error);
    }

    // 预取全部活跃成员列表，供管理员排班下拉选择器使用
    const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id, name, student_id')
        .eq('status', 'active')
        .order('name');

    if (membersError) {
        console.error('获取成员列表失败:', membersError);
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <DutyClient
                initialData={(rosters || []) as unknown as RosterWithMember[]}
                initialMembers={members || []}
            />
        </div>
    );
}
