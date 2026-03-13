import { useState, useCallback, useMemo, useRef, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Database } from '@/types/supabase';
import { useToast } from '@/components/ui/toast-simple';
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
    lat: 39.182216,
    lng: 117.127909,
};
const DEFAULT_MAX_VALID_RADIUS_METERS = 50;

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
const SIGN_IN_ATTEMPT_COOLDOWN_MS = 5000;

// 星期标签，用于生成可读的提示信息
const DAYS_LABEL = ['一', '二', '三', '四', '五'];

/**
 * 计算两个经纬度之间的地球表面距离 (Haversine 公式)
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
    const { user } = useUserStore();
    const supabase = useMemo(() => createClient(), []);

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

        const existingSlot = rosters.find(r => r.day_of_week === day && r.period === period && r.member_id === memberId);
        const isAdding = !existingSlot;

        // 乐观更新 UI
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
    }, [rosters, user, toast, refreshRosters, supabase]);

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
                title: '请求过于频繁',
                description: '请等待 ' + waitSeconds + ' 秒后再尝试签到。',
                variant: 'destructive'
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

        const geolocationWatchdog = window.setTimeout(() => {
            if (!finishSignIn()) return;
            toast({
                title: '签到失败',
                description: '定位请求超时，请检查权限设置后重试。',
                variant: 'destructive'
            });
        }, 15000);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        try {
            const { data: existingLogs, error: existingError } = await supabase
                .from('duty_logs')
                .select('id')
                .eq('member_id', user.id)
                .gte('sign_in_time', today.toISOString())
                .limit(1);

            if (!existingError && !!existingLogs && existingLogs.length > 0) {
                window.clearTimeout(geolocationWatchdog);
                toast({
                    title: '今日已签到',
                    description: '您今天已有签到记录，无需重复签到。'
                });
                finishSignIn();
                return;
            }
        } catch (checkError) {
            console.warn('Failed to pre-check sign-in logs:', checkError);
        }

        if (!navigator.geolocation) {
            window.clearTimeout(geolocationWatchdog);
            toast({
                title: '当前设备不支持定位',
                description: '请使用支持定位的浏览器后重试。',
                variant: 'destructive'
            });
            finishSignIn();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                if (completed) return;
                window.clearTimeout(geolocationWatchdog);

                if (!position || !position.coords) {
                    toast({
                        title: '定位数据异常',
                        description: '未获取到有效定位信息，请检查设备定位服务后重试。',
                        variant: 'destructive'
                    });
                    finishSignIn();
                    return;
                }

                const latitude = Number(position.coords.latitude);
                const longitude = Number(position.coords.longitude);

                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                    toast({
                        title: '签到失败',
                        description: '定位坐标无效，请稍后重试。',
                        variant: 'destructive'
                    });
                    finishSignIn();
                    return;
                }

                const distance = getDistanceFromLatLonInM(latitude, longitude, STUDIO_COORDS.lat, STUDIO_COORDS.lng);

                if (distance > MAX_VALID_RADIUS_METERS) {
                    toast({
                        title: '签到失败',
                        description: `当前位置距离工作室约 ${Math.round(distance)} 米，超出允许范围。`,
                        variant: 'destructive'
                    });
                    finishSignIn();
                    return;
                }

                try {
                    const deviceInfo = window.navigator.userAgent;
                    const { error } = await supabase
                        .from('duty_logs')
                        .insert({
                            member_id: user.id,
                            location_verified: true,
                            device_info: deviceInfo
                        });

                    if (error) throw error;
                    toast({ title: '签到成功', description: '已完成位置验证并记录到值班考勤。' });
                } catch (err) {
                    const typedError = err as { code?: string; message?: string };
                    if (typedError?.code === '23505') {
                        toast({ title: '今日已签到', description: '检测到重复签到请求，系统已自动拦截。' });
                    } else {
                        toast({
                            title: '签到失败',
                            description: typedError?.message || '无法写入签到记录，请稍后重试。',
                            variant: 'destructive'
                        });
                    }
                } finally {
                    finishSignIn();
                }
            },
            (geoError) => {
                if (completed) return;
                window.clearTimeout(geolocationWatchdog);

                let msg = '请检查定位权限后重试。';
                if (geoError.code === geoError.PERMISSION_DENIED) msg = '定位权限被拒绝，无法进行签到。';
                if (geoError.code === geoError.POSITION_UNAVAILABLE) msg = '无法获取定位信息，请检查设备定位服务。';
                if (geoError.code === geoError.TIMEOUT) msg = '定位请求超时，请稍后重试。';

                toast({ title: '签到失败', description: msg, variant: 'destructive' });
                finishSignIn();
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    }, [isSigningIn, user, toast, supabase]);

    // ------------------------------------------------------------------------
    // 3. 换班系统逻辑
    // ------------------------------------------------------------------------
    const [isSwapping, setIsSwapping] = useState(false);

    const submitSwapRequest = async (originalDay: number, originalPeriod: number, targetId?: string, targetDay?: number, targetPeriod?: number) => {
        if (!user) return false;
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
        setIsSwapping(true);
        try {
            if (!accept) {
                // 撤销或删除请求
                const { error } = await supabase.from('duty_swaps').delete().eq('id', swapId);
                if (error) throw error;
                toast({ title: '已移除请求', description: '该换班请求已被撤销或拒绝。' });
            } else {
                // 管理员批准代班：调用 RPC 函数原子性完成排班转让
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

                // 调用 RPC，此时 RPC 内部使用 target_id（已由 volunteerForSwap 设置）
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

    // 普通用户应答代班请求（设置 target_id 和 status→accepted，等待管理员审批）
    const volunteerForSwap = async (swapId: string) => {
        if (!user) return;
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

    // 管理员驳回代班请求（将 accepted 退回 pending，清除 target_id）
    const rejectSwap = async (swapId: string) => {
        if (!user) return;
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
            .order('created_at', { ascending: false })
            .limit(10);

        if (!error && data) {
            setKeyTransfers(data);
        }
    }, [supabase]);

    // 发起钥匙交接
    const submitKeyTransfer = async (toMemberId: string, note: string) => {
        if (!user) return false;
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
