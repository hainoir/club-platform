import { resolveCurrentDutyAvailability } from '@/lib/duty/duty-sign-in';
import { isAdminRole, useUserStore } from '@/store/useUserStore';
import { useToast } from '@/components/ui/toast-simple';
import { useSupabase } from '@/hooks/shared/useSupabase';
import { useProtectedAction } from '@/hooks/shared/useProtectedAction';
import { useStudioAdminActions } from '@/hooks/studio/useStudioAdminActions';
import { useStudioPresenceQuery } from '@/hooks/studio/useStudioPresenceQuery';
import { useSelfStudyActions } from '@/hooks/studio/useSelfStudyActions';

import type { RosterWithMember } from '@/hooks/useDuty';
export type { StudioMember } from './types';

interface UseStudioPresenceOptions {
    rosters: RosterWithMember[];
    allowAdminDeleteStudy?: boolean;
}

export function useStudioPresence({
    rosters,
    allowAdminDeleteStudy = true,
}: UseStudioPresenceOptions) {
    const supabase = useSupabase();
    const { user } = useUserStore();
    const { toast } = useToast();
    const { requireAuth } = useProtectedAction();
    const isAdmin = isAdminRole(user?.role);
    const canAdminDeleteStudy = allowAdminDeleteStudy && isAdmin;

    const {
        studioMembers,
        loading,
        errorMsg,
        fetchStudioMembers,
    } = useStudioPresenceQuery(supabase, rosters);

    const {
        ending,
        isStartingStudy,
        startSelfStudy,
        endSelfStudy,
    } = useSelfStudyActions({
        supabase,
        user,
        studioMembers,
        requireAuth,
        toast,
        refreshStudioMembers: fetchStudioMembers,
    });

    const {
        deletingSessionId,
        deleteStudySession,
    } = useStudioAdminActions({
        supabase,
        canAdminDeleteStudy,
        requireAuth,
        toast,
        refreshStudioMembers: fetchStudioMembers,
    });

    const isAlreadyInStudio = studioMembers.some((member) => member.id === user?.id);
    const isSelfStudying = studioMembers.some((member) => member.id === user?.id && member.type === 'study');
    const todayAssignedPeriods = user
        ? Array.from(new Set(rosters.filter((r) => r.member_id === user.id && r.day_of_week === new Date().getDay()).map((r) => r.period)))
        : [];
    const isInOwnDutyPeriod = resolveCurrentDutyAvailability(todayAssignedPeriods).canSignInNow;

    return {
        studioMembers,
        loading,
        ending,
        isStartingStudy,
        deletingSessionId,
        errorMsg,
        canAdminDeleteStudy,
        isAlreadyInStudio,
        isSelfStudying,
        isInOwnDutyPeriod,
        startSelfStudy,
        endSelfStudy,
        deleteStudySession,
    };
}
