"use client"

import * as React from "react"

import { SignInCard } from "@/components/duty/attendance/SignInCard"
import { useToast } from "@/components/ui/toast-simple"
import {
    DUTY_SIGN_IN_ACTION_COOLDOWN_MS,
    DUTY_SIGN_IN_PERIOD_RANGES,
    getDutySignInErrorMessage,
    resolveCurrentDutyAvailability,
    submitDutySignIn,
    type DutyAvailabilityReason,
} from "@/lib/duty/duty-sign-in"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"

/**
 * 【学习注释：仪表盘签到入口的客户端职责】
 * 这个组件同时依赖当前时间、今日排班、浏览器定位和数据库写入，天然属于 Client Component。
 * 把它从首页服务端组件里拆出来后，数据聚合和强交互逻辑的边界会更清晰。
 */
type DisabledReason = DutyAvailabilityReason

interface DashboardSignInWidgetProps {
    memberId: string | null
    todayAssignedPeriods: number[]
    initialHasSignedInToday: boolean
}

export function DashboardSignInWidget({
    memberId,
    todayAssignedPeriods,
    initialHasSignedInToday,
}: DashboardSignInWidgetProps) {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [isSigningIn, setIsSigningIn] = React.useState(false)
    const [hasSignedInToday, setHasSignedInToday] = React.useState(initialHasSignedInToday)
    const [isInDutyPeriod, setIsInDutyPeriod] = React.useState(false)
    const [disabledReason, setDisabledReason] = React.useState<DisabledReason>("not_in_period")
    const lastSignInAttemptAtRef = React.useRef(0)

    const assignedPeriods = React.useMemo(
        () => Array.from(new Set(todayAssignedPeriods.filter((period) => DUTY_SIGN_IN_PERIOD_RANGES[period]))),
        [todayAssignedPeriods]
    )

    // 【学习注释：按钮是否可点，先由“当前是否轮到我值班”决定】
    // 这一步只做前端交互层的快速反馈，真正写库前仍会继续做重复签到和定位校验。
    const refreshSignInState = React.useCallback(() => {
        const availability = resolveCurrentDutyAvailability(assignedPeriods)
        setIsInDutyPeriod(availability.canSignInNow)
        setDisabledReason(availability.disabledReason)
    }, [assignedPeriods])

    React.useEffect(() => {
        refreshSignInState()
        const timer = window.setInterval(refreshSignInState, 60_000)
        return () => window.clearInterval(timer)
    }, [refreshSignInState])

    // 【学习注释：签到写入前的三层防线】
    // 先做点击节流，再查当天是否已签到，最后才进入定位与写库流程。
    // 这种顺序能把最便宜的失败尽量前置，减少无意义的定位请求和数据库压力。
    const onSignIn = React.useCallback(async () => {
        if (isSigningIn) return

        const nowTs = Date.now()
        const elapsed = nowTs - lastSignInAttemptAtRef.current
        if (elapsed < DUTY_SIGN_IN_ACTION_COOLDOWN_MS) {
            const waitSeconds = Math.max(1, Math.ceil((DUTY_SIGN_IN_ACTION_COOLDOWN_MS - elapsed) / 1000))
            toast({
                title: "请求过于频繁",
                description: `请等待 ${waitSeconds} 秒后再尝试签到。`,
                variant: "destructive",
            })
            return
        }
        lastSignInAttemptAtRef.current = nowTs

        if (!memberId) {
            toast({ title: "无法签到", description: "未找到当前成员档案，请联系管理员。", variant: "destructive" })
            return
        }

        if (hasSignedInToday) {
            toast({ title: "今日已签到", description: "您今天已有签到记录，无需重复签到。" })
            return
        }

        setIsSigningIn(true)
        try {
            // 【学习注释：写操作前先确认 session 还有足够寿命】
            // 否则定位成功后才发现 token 过期，会把用户体验变成“看起来能点，提交时失败”。
            let activeSession = false
            try {
                activeSession = !!(await ensureClientSession(supabase))
            } catch (sessionError) {
                console.warn("Failed to recover auth session before dashboard duty sign-in:", sessionError)
            }

            if (!activeSession) {
                toast({
                    title: "登录状态已失效",
                    description: "请重新登录后再进行值班签到。",
                    variant: "destructive",
                })
                return
            }

            const result = await submitDutySignIn({
                supabase,
                memberId,
                deviceInfo: window.navigator.userAgent,
            })

            if (result === "already_signed_in") {
                setHasSignedInToday(true)
                toast({ title: "今日已签到", description: "您今天已有签到记录，无需重复签到。" })
                return
            }

            setHasSignedInToday(true)
            refreshSignInState()
            toast({ title: "签到成功", description: "已完成位置验证并记录到值班考勤。" })
        } catch (error) {
            toast({
                title: "签到失败",
                description: getDutySignInErrorMessage(error),
                variant: "destructive",
            })
        } finally {
            setIsSigningIn(false)
        }
    }, [hasSignedInToday, isSigningIn, memberId, refreshSignInState, supabase, toast])

    return (
        <SignInCard
            onSignIn={onSignIn}
            isSigningIn={isSigningIn}
            hasSignedInToday={hasSignedInToday}
            isInDutyPeriod={isInDutyPeriod}
            disabledReason={disabledReason}
        />
    )
}
