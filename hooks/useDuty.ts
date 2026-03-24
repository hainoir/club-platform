import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';
import { Database } from '@/types/supabase';
import { useToast } from '@/components/ui/toast-simple';
import { getCurrentPositionWithFallback, getLocationErrorReason } from '@/lib/geolocation';
import { EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER } from '@/lib/keyTransferFilters';
import { useUserStore, isAdminRole } from '@/store/useUserStore';

type DutyRoster = Database['public']['Tables']['duty_rosters']['Row'];
type Member = Database['public']['Tables']['members']['Row'];

type DutySwap = Database['public']['Tables']['duty_swaps']['Row'];

// 联合类型，用于前端展示合并的信息
export interface RosterWithMember extends DutyRoster {
    member: Pick<Member, 'id' | 'name' | 'student_id'>;
}

export interface SwapWithMember extends DutySwap {
    requester: Pick<Member, 'id' | 'name'>;
    target?: Pick<Member, 'id' | 'name'> | null;
}

// -------------------------------------------------------------
// 工作室预设坐标与有效打卡半径配置 (请按需修改)
// -------------------------------------------------------------
const DEFAULT_STUDIO_COORDS = {
    lat: 39.181074,
    lng: 117.12138,
};
const DEFAULT_MAX_VALID_RADIUS_METERS = 50;
const DEFAULT_MAX_GEO_ACCURACY_METERS = 100;

function parseClientNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const STUDIO_COORDS = {
    lat: parseClientNumber(process.env.NEXT_PUBLIC_STUDIO_LAT, DEFAULT_STUDIO_COORDS.lat),
    lng: parseClientNumber(process.env.NEXT_PUBLIC_STUDIO_LNG, DEFAULT_STUDIO_COORDS.lng),
};
const MAX_VALID_RADIUS_METERS = parseClientNumber(
    process.env.NEXT_PUBLIC_STUDIO_RADIUS_METERS,
    DEFAULT_MAX_VALID_RADIUS_METERS
);
const MAX_GEO_ACCURACY_METERS = parseClientNumber(
    process.env.NEXT_PUBLIC_STUDIO_MAX_GEO_ACCURACY_METERS,
    DEFAULT_MAX_GEO_ACCURACY_METERS
);
const SIGN_IN_ATTEMPT_COOLDOWN_MS = 5000;

// 星期标签，用于生成可读的提示信息
const DAYS_LABEL = ['一', '二', '三', '四', '五'];

/**
 * 计算两个经纬度之间的地表距离（哈弗辛公式）
 */
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // 地球半径，单位米
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = p2 - p1;
    const deltaLon = lon2 - lon1;
    const deltaLambda = deltaLon * Math.PI / 180;
    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function useDuty(initialRosters: RosterWithMember[]) {
    const [rosters, setRosters] = useState<RosterWithMember[]>(initialRosters);
    const [swaps, setSwaps] = useState<SwapWithMember[]>([]);
    const [approvedSwaps, setApprovedSwaps] = useState<SwapWithMember[]>([]);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const { user, setUser } = useUserStore();
    const supabase = useMemo(() => createClient(), []);

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

    // ------------------------------------------------------------------------
    // 初始化与刷新数据
    // ------------------------------------------------------------------------
    const refreshRosters = useCallback(async () => {
        const { data, error } = await supabase
            .from('duty_rosters')
            .select('*, member:members(id, name, student_id)');

        if (!error && data) {
            setRosters(data as unknown as RosterWithMember[]);
        }
    }, [supabase]);

    const refreshSwaps = useCallback(async () => {
        const { data, error } = await supabase
            .from('duty_swaps')
            .select('*, requester:members!duty_swaps_requester_id_fkey(id, name), target:members!duty_swaps_target_id_fkey(id, name)')
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: false });

        if (!error && data) {
            setSwaps(data as unknown as SwapWithMember[]);
        }
    }, [supabase]);

    // 获取已批准的代班记录（供值班表显示标签用）
    const refreshApprovedSwaps = useCallback(async () => {
        const { data, error } = await supabase
            .from('duty_swaps')
            .select('*, requester:members!duty_swaps_requester_id_fkey(id, name), target:members!duty_swaps_target_id_fkey(id, name)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setApprovedSwaps(data as unknown as SwapWithMember[]);
        }
    }, [supabase]);

    // ------------------------------------------------------------------------
    // 1. 排班操作 (指派/移除成员) - 仅管理员可操作，带乐观更新
    // ------------------------------------------------------------------------
    const toggleDutySlot = useCallback(async (day: number, period: number, memberId: string, memberName: string) => {
        if (!user) {
            toast({ title: '尚未登录', description: '请先登录后再进行排班操作。', variant: 'destructive' });
            return;
        }

        // 权限前置守卫：仅管理员可操作
        if (!isAdminRole(user.role)) {
            toast({ title: '权限不足', description: '仅管理员可以进行排班操作。', variant: 'destructive' });
            return;
        }

        if (!(await ensureActiveSession())) {
            return;
        }

        const existingSlot = rosters.find(r => r.day_of_week === day && r.period === period && r.member_id === memberId);
        const isAdding = !existingSlot;

        // 乐观更新界面
        startTransition(() => {
            if (isAdding) {
                // 添加占位符
                const optimisticRoster: RosterWithMember = {
                    id: `temp-${Date.now()}`,
                    member_id: memberId,
                    day_of_week: day,
                    period,
                    has_key: false,
                    created_at: new Date().toISOString(),
                    member: {
                        id: memberId,
                        name: memberName,
                        student_id: null
                    }
                };
                setRosters(prev => [...prev, optimisticRoster]);
            } else {
                // 移除
                setRosters(prev => prev.filter(r => r.id !== existingSlot.id));
            }
        });

        try {
            if (isAdding) {
                const { error } = await supabase
                    .from('duty_rosters')
                    .insert({
                        member_id: memberId,
                        day_of_week: day,
                        period,
                    });
                if (error) throw error;
                toast({ title: '指派成功', description: `已将 ${memberName} 安排到周${day}第${period}大节值班。` });
            } else {
                const { error } = await supabase
                    .from('duty_rosters')
                    .delete()
                    .eq('member_id', memberId)
                    .eq('day_of_week', day)
                    .eq('period', period);
                if (error) throw error;
                toast({ title: '已移除排班', description: `已将 ${memberName} 从该时段移除。` });
            }
            // 重新加载真实数据
            refreshRosters();
        } catch (error: any) {
            await refreshRosters();
            const message = error?.code === '42501'
                ? '数据库权限拒绝：请确认已应用最新 duty/key RLS 策略，并检查当前账号角色。'
                : error?.message || '更新值班状态出错，请稍后重试';
            toast({
                title: '操作失败',
                description: message,
                variant: 'destructive',
            });
        }
    }, [rosters, user, toast, refreshRosters, supabase, ensureActiveSession]);

    // ------------------------------------------------------------------------
    // 2. 签到打卡 (包含地理位置定位与算距防作弊)
    // ------------------------------------------------------------------------
    const [isSigningIn, setIsSigningIn] = useState(false);
    const lastSignInAttemptAtRef = useRef(0);

    const performSignIn = useCallback(async () => {
        if (!user) return;
        if (isSigningIn) return;

        const nowTs = Date.now();
        const elapsed = nowTs - lastSignInAttemptAtRef.current;
        if (elapsed < SIGN_IN_ATTEMPT_COOLDOWN_MS) {
            const waitSeconds = Math.max(1, Math.ceil((SIGN_IN_ATTEMPT_COOLDOWN_MS - elapsed) / 1000));
            toast({
                title: "\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41",
                description: `\u8bf7\u7b49\u5f85 ${waitSeconds} \u79d2\u540e\u518d\u5c1d\u8bd5\u7b7e\u5230\u3002`,
                variant: "destructive"
            });
            return;
        }
        lastSignInAttemptAtRef.current = nowTs;

        setIsSigningIn(true);

        let completed = false;
        const finishSignIn = () => {
            if (completed) return false;
            completed = true;
            setIsSigningIn(false);
            return true;
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        try {
            const { data: existingLogs, error: existingError } = await supabase
                .from("duty_logs")
                .select("id")
                .eq("member_id", user.id)
                .gte("sign_in_time", today.toISOString())
                .limit(1);

            if (!existingError && !!existingLogs && existingLogs.length > 0) {
                toast({
                    title: "\u4eca\u65e5\u5df2\u7b7e\u5230",
                    description: "\u60a8\u4eca\u5929\u5df2\u6709\u7b7e\u5230\u8bb0\u5f55\uff0c\u65e0\u9700\u91cd\u590d\u7b7e\u5230\u3002"
                });
                finishSignIn();
                return;
            }
        } catch (checkError) {
            console.warn("Failed to pre-check sign-in logs:", checkError);
        }

        if (!navigator.geolocation) {
            toast({
                title: "\u7b7e\u5230\u5931\u8d25",
                description: "\u5f53\u524d\u8bbe\u5907\u4e0d\u652f\u6301\u5b9a\u4f4d\uff0c\u8bf7\u4f7f\u7528\u652f\u6301\u5b9a\u4f4d\u7684\u6d4f\u89c8\u5668\u540e\u91cd\u8bd5\u3002",
                variant: "destructive"
            });
            finishSignIn();
            return;
        }

        let position: GeolocationPosition;
        try {
            position = await getCurrentPositionWithFallback();
        } catch (geoError) {
            if (completed) return;

            let description = "\u8bf7\u68c0\u67e5\u5b9a\u4f4d\u6743\u9650\u540e\u91cd\u8bd5\u3002";
            const reason = getLocationErrorReason(geoError);

            if (reason === "permission_denied") description = "\u5b9a\u4f4d\u6743\u9650\u88ab\u62d2\u7edd\uff0c\u65e0\u6cd5\u8fdb\u884c\u7b7e\u5230\u3002";
            if (reason === "position_unavailable") description = "\u65e0\u6cd5\u83b7\u53d6\u5b9a\u4f4d\u4fe1\u606f\uff0c\u8bf7\u68c0\u67e5\u8bbe\u5907\u5b9a\u4f4d\u670d\u52a1\u3002";
            if (reason === "timeout") description = "\u5b9a\u4f4d\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
            if (reason === "not_supported") description = "\u5f53\u524d\u8bbe\u5907\u6216\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u5b9a\u4f4d\u3002";
            if (reason === "insecure_context") description = "\u8bf7\u4f7f\u7528 HTTPS \u6216 localhost \u8bbf\u95ee\u540e\u518d\u8bd5\u3002";

            toast({ title: "\u7b7e\u5230\u5931\u8d25", description, variant: "destructive" });
            finishSignIn();
            return;
        }

        if (!position || !position.coords) {
            toast({
                title: "\u5b9a\u4f4d\u6570\u636e\u5f02\u5e38",
                description: "\u672a\u83b7\u53d6\u5230\u6709\u6548\u5b9a\u4f4d\u4fe1\u606f\uff0c\u8bf7\u68c0\u67e5\u8bbe\u5907\u5b9a\u4f4d\u670d\u52a1\u540e\u91cd\u8bd5\u3002",
                variant: "destructive"
            });
            finishSignIn();
            return;
        }

        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            toast({
                title: "\u7b7e\u5230\u5931\u8d25",
                description: "\u5b9a\u4f4d\u5750\u6807\u65e0\u6548\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
                variant: "destructive"
            });
            finishSignIn();
            return;
        }

        const accuracy = Number(position.coords.accuracy);

        if (!Number.isFinite(accuracy)) {
            toast({
                title: "签到失败",
                description: "定位精度异常，请稍后重试。",
                variant: "destructive"
            });
            finishSignIn();
            return;
        }

        if (accuracy > MAX_GEO_ACCURACY_METERS) {
            toast({
                title: "定位精度不足",
                description: `当前定位精度约 ${Math.round(accuracy)} 米，请移动到开阔区域后重试。`,
                variant: "destructive"
            });
            finishSignIn();
            return;
        }

        const distance = getDistanceFromLatLonInM(latitude, longitude, STUDIO_COORDS.lat, STUDIO_COORDS.lng);

        if (distance > MAX_VALID_RADIUS_METERS) {
            toast({
                title: "\u7b7e\u5230\u5931\u8d25",
                description: `\u5f53\u524d\u4f4d\u7f6e\u8ddd\u79bb\u5de5\u4f5c\u5ba4\u7ea6 ${Math.round(distance)} \u7c73\uff0c\u8d85\u51fa\u5141\u8bb8\u8303\u56f4\u3002`,
                variant: "destructive"
            });
            finishSignIn();
            return;
        }

        try {
            const deviceInfo = window.navigator.userAgent;
            const { error } = await supabase
                .from("duty_logs")
                .insert({
                    member_id: user.id,
                    location_verified: true,
                    device_info: deviceInfo
                });

            if (error) throw error;
            toast({ title: "\u7b7e\u5230\u6210\u529f", description: "\u5df2\u5b8c\u6210\u4f4d\u7f6e\u9a8c\u8bc1\u5e76\u8bb0\u5f55\u5230\u503c\u73ed\u8003\u52e4\u3002" });
        } catch (err) {
            const typedError = err as { code?: string; message?: string };
            if (typedError?.code === "23505") {
                toast({ title: "\u4eca\u65e5\u5df2\u7b7e\u5230", description: "\u68c0\u6d4b\u5230\u91cd\u590d\u7b7e\u5230\u8bf7\u6c42\uff0c\u7cfb\u7edf\u5df2\u81ea\u52a8\u62e6\u622a\u3002" });
            } else {
                toast({
                    title: "\u7b7e\u5230\u5931\u8d25",
                    description: typedError?.message || "\u65e0\u6cd5\u5199\u5165\u7b7e\u5230\u8bb0\u5f55\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
                    variant: "destructive"
                });
            }
        } finally {
            finishSignIn();
        }
    }, [isSigningIn, user, toast, supabase]);

    // ------------------------------------------------------------------------
    // 3. 换班系统逻辑
    // ------------------------------------------------------------------------
    const [isSwapping, setIsSwapping] = useState(false);

    const submitSwapRequest = async (originalDay: number, originalPeriod: number, targetId?: string, targetDay?: number, targetPeriod?: number) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;
        setIsSwapping(true);
        try {
            const { error } = await supabase
                .from('duty_swaps')
                .insert({
                    requester_id: user.id,
                    original_day: originalDay,
                    original_period: originalPeriod,
                    target_id: targetId || null,
                    target_day: targetDay || null,
                    target_period: targetPeriod || null
                });

            if (error) throw error;
            toast({ title: '已发布调班请求', description: '请求已送入大厅等地他人响应。' });
            refreshSwaps();
            return true;
        } catch (err: any) {
            toast({ title: '发布失败', description: err.message, variant: 'destructive' });
            return false;
        } finally {
            setIsSwapping(false);
        }
    };

    const respondToSwap = async (swapId: string, accept: boolean) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            if (!accept) {
                // 撤销或删除请求
                const { error } = await supabase.from('duty_swaps').delete().eq('id', swapId);
                if (error) throw error;
                toast({ title: '已移除请求', description: '该换班请求已被撤销或拒绝。' });
            } else {
                // 管理员批准代班：调用远程过程函数，原子性完成排班转让
                if (!isAdminRole(user.role)) {
                    toast({ title: '权限不足', description: '仅管理员可以审批换班请求。', variant: 'destructive' });
                    setIsSwapping(false);
                    return;
                }

                const swapRecord = swaps.find(s => s.id === swapId);
                if (!swapRecord) {
                    toast({ title: '请求不存在', description: '该换班请求可能已被撤销。', variant: 'destructive' });
                    setIsSwapping(false);
                    return;
                }

                // 调用远程过程函数，此时内部会使用目标成员字段（已在前一步应答流程中设置）
                const { error: rpcError } = await supabase.rpc('accept_duty_swap', {
                    p_swap_id: swapId,
                    p_acceptor_id: swapRecord.target?.id || '',
                });

                if (rpcError) throw rpcError;

                toast({
                    title: '已批准代班',
                    description: `${swapRecord.target?.name} 将接替 ${swapRecord.requester.name} 周${DAYS_LABEL[swapRecord.original_day - 1]}第${swapRecord.original_period}大节的值班。`
                });

                refreshRosters();
            }
            refreshSwaps();
        } catch (err: any) {
            toast({ title: '操作失败', description: err.message, variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    };

    // 普通用户应答代班请求（写入目标成员，并将状态设为“已应答”，等待管理员审批）
    const volunteerForSwap = async (swapId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            const { error } = await supabase
                .from('duty_swaps')
                .update({ target_id: user.id, status: 'accepted' })
                .eq('id', swapId);

            if (error) throw error;

            const swapRecord = swaps.find(s => s.id === swapId);
            toast({
                title: '已应答代班',
                description: `您已应答 ${swapRecord?.requester.name || ''} 的代班请求，等待管理员审批。`
            });
            refreshSwaps();
        } catch (err: any) {
            toast({ title: '应答失败', description: err.message, variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    };

    // 管理员驳回代班请求（将状态从“已应答”回退到“待处理”，并清除目标成员）
    const rejectSwap = async (swapId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            const { error } = await supabase
                .from('duty_swaps')
                .update({ target_id: null, status: 'pending' })
                .eq('id', swapId);

            if (error) throw error;
            toast({ title: '已驳回', description: '该代班请求已退回大厅，等待他人重新应答。' });
            refreshSwaps();
        } catch (err: any) {
            toast({ title: '操作失败', description: err.message, variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    };
    // ------------------------------------------------------------------------
    // 4. 钥匙管理
    // ------------------------------------------------------------------------

    // 管理员切换某成员的钥匙持有状态（更新该成员所有排班记录）
    const toggleKey = async (memberId: string, hasKey: boolean) => {
        if (!user) {
            toast({ title: '尚未登录', description: '请先登录后再进行钥匙操作。', variant: 'destructive' });
            return;
        }

        if (!isAdminRole(user.role)) {
            toast({ title: '权限不足', description: '仅管理员可以修改钥匙持有状态。', variant: 'destructive' });
            return;
        }

        if (!(await ensureActiveSession())) return;

        try {
            const { error } = await supabase
                .from('duty_rosters')
                .update({ has_key: hasKey })
                .eq('member_id', memberId);

            if (error) throw error;
            toast({ title: hasKey ? '已标记持有钥匙' : '已取消钥匙标记' });
            refreshRosters();
        } catch (err: any) {
            const message = err?.code === '42501'
                ? '数据库权限拒绝：请确认已应用最新 duty/key RLS 策略，并检查当前账号角色。'
                : err?.message || '更新钥匙状态失败，请稍后重试。';
            toast({ title: '操作失败', description: message, variant: 'destructive' });
        }
    };

    // ------------------------------------------------------------------------
    // 5. 请假与补班
    // ------------------------------------------------------------------------
    const [leaves, setLeaves] = useState<any[]>([]);

    const refreshLeaves = useCallback(async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('duty_leaves')
            .select('*, member:members!duty_leaves_member_id_fkey(id, name)')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setLeaves(data);
        }
    }, [supabase, user]);

    // 提交请假申请（含补班安排）
    const submitLeave = async (
        day: number,
        period: number,
        reason: string,
        penaltyShifts: number,
        compensations: { day_of_week: number; period: number }[]
    ) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;
        try {
            // 1. 创建请假记录
            const { data: leaveData, error: leaveError } = await supabase
                .from('duty_leaves')
                .insert({
                    member_id: user.id,
                    day_of_week: day,
                    period: period,
                    reason: reason || null,
                    penalty_shifts: penaltyShifts,
                })
                .select('id')
                .single();

            if (leaveError) throw leaveError;

            // 2. 创建补班安排
            if (compensations.length > 0 && leaveData) {
                const compRecords = compensations.map(c => ({
                    leave_id: leaveData.id,
                    member_id: user.id,
                    day_of_week: c.day_of_week,
                    period: c.period,
                }));

                const { error: compError } = await supabase
                    .from('duty_compensations')
                    .insert(compRecords);

                if (compError) throw compError;
            }

            toast({
                title: '请假申请已提交',
                description: `周${DAYS_LABEL[day - 1]}第${period}大节，下周补${penaltyShifts}节。`
            });
            refreshLeaves();
            return true;
        } catch (err: any) {
            toast({ title: '请假失败', description: err.message, variant: 'destructive' });
            return false;
        }
    };

    // ------------------------------------------------------------------------
    // 6. 钥匙交接
    // ------------------------------------------------------------------------
    const [keyTransfers, setKeyTransfers] = useState<any[]>([]);

    const refreshKeyTransfers = useCallback(async () => {
        const { data, error } = await supabase
            .from('key_transfers')
            .select('*, from_member:members!key_transfers_from_member_id_fkey(id, name), to_member:members!key_transfers_to_member_id_fkey(id, name)')
            .or(EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER)
            .order('created_at', { ascending: false })
            .limit(10);

        if (!error && data) {
            setKeyTransfers(data);
        }
    }, [supabase]);

    // 发起钥匙交接
    const submitKeyTransfer = async (toMemberId: string, note: string) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;
        try {
            const { error } = await supabase
                .from('key_transfers')
                .insert({
                    from_member_id: user.id,
                    to_member_id: toMemberId,
                    note: note || null,
                });

            if (error) throw error;
            toast({ title: '已发起钥匙交接', description: '等待接收人确认。' });
            refreshKeyTransfers();
            return true;
        } catch (err: any) {
            toast({ title: '发起失败', description: err.message, variant: 'destructive' });
            return false;
        }
    };

    // 确认接收钥匙
    const confirmKeyTransfer = async (transferId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase.rpc('confirm_key_transfer', {
                p_transfer_id: transferId,
                p_confirmer_id: user.id,
            });

            if (error) throw error;
            toast({ title: '钥匙交接完成！', description: '您已确认接收钥匙，排班表钥匙标记已更新。' });
            refreshKeyTransfers();
            refreshRosters();
        } catch (err: any) {
            toast({ title: '确认失败', description: err.message, variant: 'destructive' });
        }
    };

    useEffect(() => {
        const syncDutyData = () => {
            void refreshRosters();
            void refreshSwaps();
            void refreshApprovedSwaps();
            void refreshLeaves();
            void refreshKeyTransfers();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncDutyData();
            }
        };

        syncDutyData();
        window.addEventListener('focus', syncDutyData);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', syncDutyData);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [refreshRosters, refreshSwaps, refreshApprovedSwaps, refreshLeaves, refreshKeyTransfers]);

    return {
        rosters,
        swaps,
        approvedSwaps,
        leaves,
        keyTransfers,
        isPending,
        isSigningIn,
        isSwapping,
        toggleDutySlot,
        toggleKey,
        performSignIn,
        refreshRosters,
        refreshSwaps,
        refreshApprovedSwaps,
        refreshLeaves,
        refreshKeyTransfers,
        submitSwapRequest,
        respondToSwap,
        volunteerForSwap,
        rejectSwap,
        submitLeave,
        submitKeyTransfer,
        confirmKeyTransfer
    };
}
