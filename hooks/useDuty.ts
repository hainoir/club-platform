import { useCallback, useRef } from 'react';

import { useToast } from '@/components/ui/toast-simple';
import { useDutyKeyTransfers } from '@/hooks/duty/useDutyKeyTransfers';
import { useDutyLeaves } from '@/hooks/duty/useDutyLeaves';
import { useDutyRosters } from '@/hooks/duty/useDutyRosters';
import { useDutySignIn } from '@/hooks/duty/useDutySignIn';
import { useDutySwaps } from '@/hooks/duty/useDutySwaps';
import { useSupabase } from '@/hooks/shared/useSupabase';
import { useVisibilitySync } from '@/hooks/shared/useVisibilitySync';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';
import { useUserStore } from '@/store/useUserStore';

import type { RefreshCallback, RosterWithMember } from '@/hooks/duty/types';

export type {
    KeyTransferWithMember,
    LeaveWithMember,
    RosterWithMember,
    SwapWithMember,
} from '@/hooks/duty/types';

/**
 * 【学习注释：值班大厅的业务编排 Hook】
 * `useDuty` 是公开门面，负责创建共享上下文并组合排班、签到、代班、请假和钥匙交接子 Hook。
 * 页面组件继续消费同一份返回值，但每个业务子域的读写逻辑已经拆到独立模块里维护。
 */
export function useDuty(initialRosters: RosterWithMember[]) {
    const { toast } = useToast();
    const { user, setUser } = useUserStore();
    const supabase = useSupabase();

    // swaps/leaves 之间需要互相触发刷新，ref 可以避免子 Hook 直接形成循环依赖。
    const refreshSwapsRef = useRef<RefreshCallback>(() => undefined);
    const refreshApprovedLeavesRef = useRef<RefreshCallback>(() => undefined);
    const refreshPendingLeavesRef = useRef<RefreshCallback>(() => undefined);

    // 【学习注释：所有写操作共用一层 session 续命】
    // 这样排班、签到、换班等动作都不需要各自重复实现 token 恢复逻辑。
    const ensureActiveSession = useCallback(async () => {
        try {
            const activeSession = await ensureClientSession(supabase);
            if (activeSession) {
                return true;
            }
        } catch (error) {
            console.warn('Failed to recover auth session before duty write:', error);
        }

        setUser(null);
        toast({
            title: '登录状态已失效',
            description: '请重新登录后再进行值班相关操作。',
            variant: 'destructive',
        });
        return false;
    }, [setUser, supabase, toast]);

    const context = {
        supabase,
        user,
        toast,
        ensureActiveSession,
    };

    const rosters = useDutyRosters(initialRosters, context);
    const signIn = useDutySignIn(context);
    const swaps = useDutySwaps({
        ...context,
        refreshRosters: rosters.refreshRosters,
        refreshApprovedLeaves: () => refreshApprovedLeavesRef.current(),
        refreshPendingLeaves: () => refreshPendingLeavesRef.current(),
    });
    const leaves = useDutyLeaves({
        ...context,
        refreshSwaps: () => refreshSwapsRef.current(),
    });
    const keyTransfers = useDutyKeyTransfers({
        ...context,
        refreshRosters: rosters.refreshRosters,
    });

    refreshSwapsRef.current = swaps.refreshSwaps;
    refreshApprovedLeavesRef.current = leaves.refreshApprovedLeaves;
    refreshPendingLeavesRef.current = leaves.refreshPendingLeaves;

    const syncDutyData = useCallback(() => {
        void rosters.refreshRosters();
        void swaps.refreshSwaps();
        void swaps.refreshApprovedSwaps();
        void leaves.refreshApprovedLeaves();
        void leaves.refreshPendingLeaves();
        void keyTransfers.refreshKeyTransfers();
    }, [
        keyTransfers.refreshKeyTransfers,
        leaves.refreshApprovedLeaves,
        leaves.refreshPendingLeaves,
        rosters.refreshRosters,
        swaps.refreshApprovedSwaps,
        swaps.refreshSwaps,
    ]);

    useVisibilitySync(syncDutyData);

    return {
        rosters: rosters.rosters,
        swaps: swaps.swaps,
        approvedSwaps: swaps.approvedSwaps,
        approvedLeaves: leaves.approvedLeaves,
        pendingLeaves: leaves.pendingLeaves,
        keyTransfers: keyTransfers.keyTransfers,
        isPending: rosters.isPending,
        isSigningIn: signIn.isSigningIn,
        isSwapping: swaps.isSwapping,
        toggleDutySlot: rosters.toggleDutySlot,
        toggleKey: rosters.toggleKey,
        performSignIn: signIn.performSignIn,
        refreshRosters: rosters.refreshRosters,
        refreshSwaps: swaps.refreshSwaps,
        refreshApprovedSwaps: swaps.refreshApprovedSwaps,
        refreshApprovedLeaves: leaves.refreshApprovedLeaves,
        refreshPendingLeaves: leaves.refreshPendingLeaves,
        refreshKeyTransfers: keyTransfers.refreshKeyTransfers,
        submitSwapRequest: swaps.submitSwapRequest,
        respondToSwap: swaps.respondToSwap,
        volunteerForSwap: swaps.volunteerForSwap,
        rejectSwap: swaps.rejectSwap,
        submitLeave: leaves.submitLeave,
        approvePendingLeave: leaves.approvePendingLeave,
        deletePendingLeave: leaves.deletePendingLeave,
        submitKeyTransfer: keyTransfers.submitKeyTransfer,
        confirmKeyTransfer: keyTransfers.confirmKeyTransfer,
    };
}
