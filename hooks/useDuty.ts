import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ensureClientSession } from '@/utils/supabase/ensure-client-session';
import { Database } from '@/types/supabase';
import { useToast } from '@/components/ui/toast-simple';
import { getCurrentPositionWithFallback, getLocationErrorReason } from '@/lib/geolocation';
import { isChinaPublicHoliday } from '@/lib/china-public-holidays';
import { getDutyNow } from '@/lib/duty-time';
import { EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER } from '@/lib/keyTransferFilters';
import { useUserStore, isAdminRole } from '@/store/useUserStore';

type DutyRoster = Database['public']['Tables']['duty_rosters']['Row'];
type Member = Database['public']['Tables']['members']['Row'];

type DutySwap = Database['public']['Tables']['duty_swaps']['Row'];
type DutyLeave = Database['public']['Tables']['duty_leaves']['Row'];

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

// 【学习注释：定位签到的可配置阈值】
// 把坐标、允许半径和精度阈值收敛成常量，方便后续针对不同场地或环境变量做替换。
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

// 【学习注释：展示层星期文案】
// 业务逻辑里保留数字更稳定，真正渲染给用户前再转换成中文标签。
const DAYS_LABEL = ['一', '二', '三', '四', '五'];

/**
 * 【学习注释：地理定位算距】
 * 浏览器返回的是经纬度，签到判断需要的是“与工作室相距多少米”，所以这里用哈弗辛公式做地表距离换算。
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

/**
 * 【学习注释：值班大厅的业务编排 Hook】
 * `useDuty` 不是单一功能 Hook，而是把排班、签到、换班、请假和钥匙交接这些高关联业务折叠成一个前端编排层。
 * 页面组件只负责展示和触发动作，真正的权限守卫、乐观更新和数据刷新在这里集中管理。
 */
export function useDuty(initialRosters: RosterWithMember[]) {
    const [rosters, setRosters] = useState<RosterWithMember[]>(initialRosters);
    const [swaps, setSwaps] = useState<SwapWithMember[]>([]);
    const [approvedSwaps, setApprovedSwaps] = useState<SwapWithMember[]>([]);
    const [approvedLeaves, setApprovedLeaves] = useState<LeaveWithMember[]>([]);
    const [pendingLeaves, setPendingLeaves] = useState<LeaveWithMember[]>([]);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const { user, setUser } = useUserStore();
    const supabase = useMemo(() => createClient(), []);

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

    // 【学习注释：基础数据刷新】
    // 这些刷新函数负责把数据库里的真实状态重新拉回前端，是所有乐观更新最终收口的依据。
    const refreshRosters = useCallback(async () => {
        const { data, error } = await supabase
            .from('duty_rosters')
            .select('*, member:members(id, name, student_id)');

        if (!error && data) {
            setRosters(data as unknown as RosterWithMember[]);
        }
    }, [supabase]);

    const refreshSwaps = useCallback(async () => {
        if (!user) {
            setSwaps([]);
            return;
        }

        let query = supabase
            .from('duty_swaps')
            .select('*, requester:members!duty_swaps_requester_id_fkey(id, name), target:members!duty_swaps_target_id_fkey(id, name)')
            .in('status', ['pending', 'accepted']);

        if (!isAdminRole(user.role)) {
            query = query.or(`requester_id.eq.${user.id},target_id.eq.${user.id},and(status.eq.pending,target_id.is.null)`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (!error && data) {
            setSwaps(data as unknown as SwapWithMember[]);
        }
    }, [supabase, user]);

    // 【学习注释：已批准代班单独拉取】
    // 值班表上的“代班”标签只关心最终生效的记录，因此和待处理请求分开维护更清晰。
    const refreshApprovedSwaps = useCallback(async () => {
        if (!user) {
            setApprovedSwaps([]);
            return;
        }

        const { data, error } = await supabase
            .from('duty_swaps')
            .select('*, requester:members!duty_swaps_requester_id_fkey(id, name), target:members!duty_swaps_target_id_fkey(id, name)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setApprovedSwaps(data as unknown as SwapWithMember[]);
        }
    }, [supabase, user]);

    // 【学习注释：排班操作与 optimistic update】
    // 管理员点击后先更新本地界面，再回写数据库；失败时再刷新真实数据回滚，兼顾速度感和正确性。
    const toggleDutySlot = useCallback(async (day: number, period: number, memberId: string, memberName: string) => {
        if (!user) {
            toast({ title: '尚未登录', description: '请先登录后再进行排班操作。', variant: 'destructive' });
            return;
        }

        // 【学习注释：权限前置守卫】
        // 先在前端拦掉明显无权操作，既减少无效请求，也让用户更快得到反馈。
        if (!isAdminRole(user.role)) {
            toast({ title: '权限不足', description: '仅管理员可以进行排班操作。', variant: 'destructive' });
            return;
        }

        if (!(await ensureActiveSession())) {
            return;
        }

        const existingSlot = rosters.find(r => r.day_of_week === day && r.period === period && r.member_id === memberId);
        const isAdding = !existingSlot;

        // 【学习注释：optimistic update】
        // 先假设请求会成功，立即更新表格，提高后台管理操作的响应感。
        startTransition(() => {
            if (isAdding) {
                // 先塞入一个临时排班项，等服务端返回后再用真实数据覆盖。
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
                // 删除动作同样先改本地列表，失败时再整表回拉。
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
            // 【学习注释：用真实数据校正乐观状态】
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

    // 【学习注释：签到流程与定位防作弊】
    // 这部分把防重复点击、定位权限、精度校验和半径限制串在一起，保证“能签到”不只是点到了按钮。
    const [isSigningIn, setIsSigningIn] = useState(false);
    const lastSignInAttemptAtRef = useRef(0);

    const performSignIn = useCallback(async () => {
        if (!user) return;
        if (isSigningIn) return;

        const dutyNow = getDutyNow();
        if (isChinaPublicHoliday(dutyNow.dateKey)) {
            toast({
                title: '公共假日无需值班',
                description: '今日为中国公共假日，系统不会记录值班签到。',
            });
            return;
        }

        const nowTs = Date.now();
        const elapsed = nowTs - lastSignInAttemptAtRef.current;
        if (elapsed < SIGN_IN_ATTEMPT_COOLDOWN_MS) {
            const waitSeconds = Math.max(1, Math.ceil((SIGN_IN_ATTEMPT_COOLDOWN_MS - elapsed) / 1000));
            toast({
                title: "请求过于频繁",
                description: `请等待 ${waitSeconds} 秒后再尝试签到。`,
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
                    title: "今日已签到",
                    description: "您今天已有签到记录，无需重复签到。"
                });
                finishSignIn();
                return;
            }
        } catch (checkError) {
            console.warn("Failed to pre-check sign-in logs:", checkError);
        }

        if (!navigator.geolocation) {
            toast({
                title: "签到失败",
                description: "当前设备不支持定位，请使用支持定位的浏览器后重试。",
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

            let description = "请检查定位权限后重试。";
            const reason = getLocationErrorReason(geoError);

            if (reason === "permission_denied") description = "定位权限被拒绝，无法进行签到。";
            if (reason === "position_unavailable") description = "无法获取定位信息，请检查设备定位服务。";
            if (reason === "timeout") description = "定位请求超时，请稍后重试。";
            if (reason === "not_supported") description = "当前设备或浏览器不支持定位。";
            if (reason === "insecure_context") description = "请使用 HTTPS 或 localhost 访问后再试。";

            toast({ title: "签到失败", description, variant: "destructive" });
            finishSignIn();
            return;
        }

        if (!position || !position.coords) {
            toast({
                title: "定位数据异常",
                description: "未获取到有效定位信息，请检查设备定位服务后重试。",
                variant: "destructive"
            });
            finishSignIn();
            return;
        }

        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            toast({
                title: "签到失败",
                description: "定位坐标无效，请稍后重试。",
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
                title: "签到失败",
                description: `当前位置距离工作室约 ${Math.round(distance)} 米，超出允许范围。`,
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
            toast({ title: "签到成功", description: "已完成位置验证并记录到值班考勤。" });
        } catch (err) {
            const typedError = err as { code?: string; message?: string };
            if (typedError?.code === "23505") {
                toast({ title: "今日已签到", description: "检测到重复签到请求，系统已自动拦截。" });
            } else {
                toast({
                    title: "签到失败",
                    description: typedError?.message || "无法写入签到记录，请稍后重试。",
                    variant: "destructive"
                });
            }
        } finally {
            finishSignIn();
        }
    }, [isSigningIn, user, toast, supabase]);

    // 【学习注释：换班请求状态机】
    // 普通成员负责发起和应答，管理员负责最终审批，前端需要把不同身份看到的动作折叠成统一接口。
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
            const swapRecord = swaps.find(s => s.id === swapId);

            if (!accept) {
                const deleteQuery = swapRecord?.leave_id
                    ? supabase.from('duty_leaves').delete().eq('id', swapRecord.leave_id).eq('status', 'pending')
                    : supabase.from('duty_swaps').delete().eq('id', swapId);

                const { error } = await deleteQuery;
                if (error) throw error;
                toast({ title: '已撤回请求', description: '关联的待生效请假与补班安排已清理。' });
            } else {
                if (!isAdminRole(user.role)) {
                    toast({ title: '权限不足', description: '仅管理员可以审批代班请求。', variant: 'destructive' });
                    setIsSwapping(false);
                    return;
                }

                if (!swapRecord) {
                    toast({ title: '请求不存在', description: '该换班请求可能已被撤销。', variant: 'destructive' });
                    setIsSwapping(false);
                    return;
                }

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
                refreshApprovedSwaps();
                refreshApprovedLeaves();
            }

            refreshSwaps();
            refreshPendingLeaves();
        } catch (err: any) {
            toast({ title: '操作失败', description: err.message, variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    };

    // 【学习注释：普通成员只能应答，不能直接完成换班】
    const volunteerForSwap = async (swapId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            const { error } = await supabase.rpc('volunteer_for_duty_swap', {
                p_swap_id: swapId,
            });

            if (error) throw error;

            const swapRecord = swaps.find(s => s.id === swapId);
            toast({
                title: '已应答代班',
                description: swapRecord?.target_id === user.id
                    ? `您已接受定向代班邀请，等待管理员审批。`
                    : `您已应答 ${swapRecord?.requester.name || ''} 的代班请求，等待管理员审批。`
            });
            refreshSwaps();
        } catch (err: any) {
            toast({ title: '应答失败', description: err.message, variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    };

    // 【学习注释：管理员驳回时回退状态机】
    const rejectSwap = async (swapId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        setIsSwapping(true);
        try {
            const { error } = await supabase.rpc('return_duty_swap_to_hall', {
                p_swap_id: swapId,
            });

            if (error) throw error;
            toast({ title: '已退回大厅', description: '该代班请求已转为公共待应答状态。' });
            refreshSwaps();
        } catch (err: any) {
            toast({ title: '操作失败', description: err.message, variant: 'destructive' });
        } finally {
            setIsSwapping(false);
        }
    };
    // 【学习注释：钥匙状态管理】
    // 钥匙是跨多个值班槽位共享的状态，因此这里按成员批量更新相关排班记录。

    // 【学习注释：钥匙权限同样前置到前端】
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

    // 【学习注释：请假读模型拆分】
    // approvedLeaves 只服务“已经生效的请假”，pendingLeaves 只服务审批/撤销界面，避免把待审批数据误用到值班表和签到逻辑。
    const refreshApprovedLeaves = useCallback(async () => {
        if (!user) {
            setApprovedLeaves([]);
            return;
        }

        const { data, error } = await supabase
            .from('duty_leaves')
            .select('*, member:members!duty_leaves_member_id_fkey(id, name)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setApprovedLeaves(data as unknown as LeaveWithMember[]);
        }
    }, [supabase, user]);

    const refreshPendingLeaves = useCallback(async () => {
        if (!user) {
            setPendingLeaves([]);
            return;
        }

        let query = supabase
            .from('duty_leaves')
            .select('*, member:members!duty_leaves_member_id_fkey(id, name)')
            .eq('status', 'pending');

        if (!isAdminRole(user.role)) {
            query = query.eq('member_id', user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (!error && data) {
            setPendingLeaves(data as unknown as LeaveWithMember[]);
        }
    }, [supabase, user]);

    // 【学习注释：请假提交流程】
    // 现在提交动作只会先创建“待审批”的 leave；是否需要代班决定是否额外创建一条关联 swap。
    const submitLeave = async (
        day: number,
        period: number,
        reason: string,
        penaltyShifts: number,
        compensations: { compensation_date: string; day_of_week: number; period: number }[],
        needSubstitute: boolean,
        targetMemberId?: string | null
    ) => {
        if (!user) return false;
        if (!(await ensureActiveSession())) return false;

        let leaveId: string | null = null;

        try {
            const { data: leaveData, error: leaveError } = await supabase
                .from('duty_leaves')
                .insert({
                    member_id: user.id,
                    day_of_week: day,
                    period,
                    reason: reason || null,
                    penalty_shifts: penaltyShifts,
                    status: 'pending',
                })
                .select('id')
                .single();

            if (leaveError || !leaveData) throw leaveError || new Error('Leave request was not created');
            const createdLeaveId = leaveData.id;
            leaveId = createdLeaveId;

            if (compensations.length > 0) {
                const compRecords = compensations.map((c) => ({
                    leave_id: createdLeaveId,
                    member_id: user.id,
                    compensation_date: c.compensation_date,
                    day_of_week: c.day_of_week,
                    period: c.period,
                }));

                const { error: compError } = await supabase
                    .from('duty_compensations')
                    .insert(compRecords);

                if (compError) throw compError;
            }

            if (needSubstitute) {
                const { error: swapError } = await supabase
                    .from('duty_swaps')
                    .insert({
                        requester_id: user.id,
                        leave_id: createdLeaveId,
                        original_day: day,
                        original_period: period,
                        target_id: targetMemberId || null,
                    });

                if (swapError) throw swapError;
            }

            toast({
                title: '请假申请已提交',
                description: needSubstitute
                    ? targetMemberId
                        ? `周${DAYS_LABEL[day - 1]}第${period}大节，已提交待审批请假，并定向邀请代班成员。`
                        : `周${DAYS_LABEL[day - 1]}第${period}大节，已提交待审批请假，并发布到公共代班大厅。`
                    : `周${DAYS_LABEL[day - 1]}第${period}大节，已提交待审批请假，等待管理员审批。`
            });

            refreshPendingLeaves();
            if (needSubstitute) {
                refreshSwaps();
            }
            return true;
        } catch (err: any) {
            if (leaveId) {
                await supabase.from('duty_leaves').delete().eq('id', leaveId).eq('status', 'pending');
            }
            toast({ title: '请假失败', description: err.message, variant: 'destructive' });
            return false;
        }
    };

    const approvePendingLeave = async (leaveId: string) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase.rpc('approve_duty_leave', {
                p_leave_id: leaveId,
            });

            if (error) throw error;

            toast({ title: '已批准请假', description: '该请假现在正式生效。' });
            refreshApprovedLeaves();
            refreshPendingLeaves();
        } catch (err: any) {
            toast({ title: '审批失败', description: err.message, variant: 'destructive' });
        }
    };

    const deletePendingLeave = async (
        leaveId: string,
        options?: { title?: string; description?: string }
    ) => {
        if (!user) return;
        if (!(await ensureActiveSession())) return;
        try {
            const { error } = await supabase
                .from('duty_leaves')
                .delete()
                .eq('id', leaveId)
                .eq('status', 'pending');

            if (error) throw error;

            toast({
                title: options?.title || '已撤回请假',
                description: options?.description || '待生效的请假与补班安排已清理。'
            });
            refreshPendingLeaves();
            refreshSwaps();
        } catch (err: any) {
            toast({ title: '操作失败', description: err.message, variant: 'destructive' });
        }
    };

    // 【学习注释：钥匙交接】
    // 这部分把“发起交接”和“接收确认”拆成两段，符合真实业务里的双人确认流程。
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

    // 【学习注释：交接发起】
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

    // 【学习注释：交接确认】
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
            void refreshApprovedLeaves();
            void refreshPendingLeaves();
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
    }, [refreshRosters, refreshSwaps, refreshApprovedSwaps, refreshApprovedLeaves, refreshPendingLeaves, refreshKeyTransfers]);

    return {
        rosters,
        swaps,
        approvedSwaps,
        approvedLeaves,
        pendingLeaves,
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
        refreshApprovedLeaves,
        refreshPendingLeaves,
        refreshKeyTransfers,
        submitSwapRequest,
        respondToSwap,
        volunteerForSwap,
        rejectSwap,
        submitLeave,
        approvePendingLeave,
        deletePendingLeave,
        submitKeyTransfer,
        confirmKeyTransfer
    };
}
