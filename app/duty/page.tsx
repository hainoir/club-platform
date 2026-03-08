import { createClient } from '@/utils/supabase/server';
import DutyClient from './DutyClient';
import { RosterWithMember } from '@/hooks/useDuty';

export const dynamic = 'force-dynamic';

export default async function DutyPage() {
    const supabase = await createClient();

    const { data: rosters, error } = await supabase
        .from('duty_rosters')
        .select('*, member:members(id, name, student_id)');

    if (error) {
        console.error('Error fetching duty rosters:', error);
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <DutyClient initialData={(rosters || []) as unknown as RosterWithMember[]} />
        </div>
    );
}
