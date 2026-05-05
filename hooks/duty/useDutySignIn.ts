import { useCallback, useRef, useState } from 'react';

import {
    DUTY_SIGN_IN_ACTION_COOLDOWN_MS,
    getDutySignInErrorMessage,
    submitDutySignIn,
} from '@/lib/duty-sign-in';
import { getDutyNow } from '@/lib/duty-time';
import { isChinaPublicHoliday } from '@/lib/china-public-holidays';

import type { DutyHookContext } from './types';

export function useDutySignIn({ supabase, user, toast, ensureActiveSession }: DutyHookContext) {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const lastSignInAttemptAtRef = useRef(0);

    // 【学习注释：签到流程与定位防作弊】
    // 这里保留交互状态和提示，定位校验、重复检查和写库统一收敛到 lib/duty-sign-in。
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
        if (elapsed < DUTY_SIGN_IN_ACTION_COOLDOWN_MS) {
            const waitSeconds = Math.max(1, Math.ceil((DUTY_SIGN_IN_ACTION_COOLDOWN_MS - elapsed) / 1000));
            toast({
                title: '请求过于频繁',
                description: `请等待 ${waitSeconds} 秒后再尝试签到。`,
                variant: 'destructive',
            });
            return;
        }
        lastSignInAttemptAtRef.current = nowTs;

        if (!(await ensureActiveSession())) return;

        setIsSigningIn(true);
        try {
            const result = await submitDutySignIn({
                supabase,
                memberId: user.id,
                deviceInfo: typeof window === 'undefined' ? undefined : window.navigator.userAgent,
            });

            if (result === 'already_signed_in') {
                toast({ title: '今日已签到', description: '您今天已有签到记录，无需重复签到。' });
                return;
            }

            toast({ title: '签到成功', description: '已完成位置验证并记录到值班考勤。' });
        } catch (error) {
            toast({
                title: '签到失败',
                description: getDutySignInErrorMessage(error),
                variant: 'destructive',
            });
        } finally {
            setIsSigningIn(false);
        }
    }, [ensureActiveSession, isSigningIn, supabase, toast, user]);

    return {
        isSigningIn,
        performSignIn,
    };
}
