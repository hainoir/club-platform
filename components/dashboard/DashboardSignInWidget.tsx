"use client"

import * as React from "react"

import { SignInCard } from "@/components/duty/SignInCard"
import { useToast } from "@/components/ui/toast-simple"
import { getCurrentPositionWithFallback, getLocationErrorReason } from "@/lib/geolocation"
import { createClient } from "@/utils/supabase/client"

/**
 * 【学习注释：仪表盘签到入口的客户端职责】
 * 这个组件同时依赖当前时间、今日排班、浏览器定位和数据库写入，天然属于 Client Component。
 * 把它从首页服务端组件里拆出来后，数据聚合和强交互逻辑的边界会更清晰。
 */
const PERIOD_RANGES: Record<number, [number, number]> = {
    1: [8 * 60, 9 * 60 + 35],
    2: [10 * 60 + 5, 11 * 60 + 40],
    3: [13 * 60 + 30, 15 * 60 + 5],
    4: [15 * 60 + 35, 17 * 60 + 10],
}

const DEFAULT_STUDIO_COORDS = {
    lat: 39.181074,
    lng: 117.12138,
}

const DEFAULT_MAX_VALID_RADIUS_METERS = 50
const DEFAULT_MAX_GEO_ACCURACY_METERS = 100
const SIGN_IN_ATTEMPT_COOLDOWN_MS = 5000

// 【学习注释：签到阈值允许被环境变量覆盖】
// 这样切换校区、测试环境或容忍范围时，不需要改组件逻辑本身。
function parseClientNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

const STUDIO_COORDS = {
    lat: parseClientNumber(process.env.NEXT_PUBLIC_STUDIO_LAT, DEFAULT_STUDIO_COORDS.lat),
    lng: parseClientNumber(process.env.NEXT_PUBLIC_STUDIO_LNG, DEFAULT_STUDIO_COORDS.lng),
}

const MAX_VALID_RADIUS_METERS = parseClientNumber(
    process.env.NEXT_PUBLIC_STUDIO_RADIUS_METERS,
    DEFAULT_MAX_VALID_RADIUS_METERS
)
const MAX_GEO_ACCURACY_METERS = parseClientNumber(
    process.env.NEXT_PUBLIC_STUDIO_MAX_GEO_ACCURACY_METERS,
    DEFAULT_MAX_GEO_ACCURACY_METERS
)

// 【学习注释：哈弗辛公式算距】
// 浏览器定位拿到的是经纬度，是否允许签到要靠真实地表距离，而不是简单比较经纬度差值。
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3
    const p1 = (lat1 * Math.PI) / 180
    const p2 = (lat2 * Math.PI) / 180
    const deltaP = p2 - p1
    const deltaLon = lon2 - lon1
    const deltaLambda = (deltaLon * Math.PI) / 180
    const a =
        Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

type DisabledReason = "not_in_period" | "not_assigned" | null

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
    const supabase = React.useMemo(() => createClient(), [])
    const { toast } = useToast()
    const [isSigningIn, setIsSigningIn] = React.useState(false)
    const [hasSignedInToday, setHasSignedInToday] = React.useState(initialHasSignedInToday)
    const [isInDutyPeriod, setIsInDutyPeriod] = React.useState(false)
    const [disabledReason, setDisabledReason] = React.useState<DisabledReason>("not_in_period")
    const lastSignInAttemptAtRef = React.useRef(0)

    const assignedPeriods = React.useMemo(
        () => Array.from(new Set(todayAssignedPeriods.filter((period) => PERIOD_RANGES[period]))),
        [todayAssignedPeriods]
    )

    // 【学习注释：按钮是否可点，先由“当前是否轮到我值班”决定】
    // 这一步只做前端交互层的快速反馈，真正写库前仍会继续做重复签到和定位校验。
    const refreshSignInState = React.useCallback(() => {
        const now = new Date()
        const todayDow = now.getDay()
        const nowMinutes = now.getHours() * 60 + now.getMinutes()

        if (todayDow < 1 || todayDow > 5) {
            setIsInDutyPeriod(false)
            setDisabledReason("not_in_period")
            return
        }

        const activePeriods = Object.entries(PERIOD_RANGES)
            .filter(([, [start, end]]) => nowMinutes >= start && nowMinutes <= end)
            .map(([period]) => Number(period))

        if (activePeriods.length === 0) {
            setIsInDutyPeriod(false)
            setDisabledReason("not_in_period")
            return
        }

        const isAssignedNow = activePeriods.some((period) => assignedPeriods.includes(period))
        setIsInDutyPeriod(isAssignedNow)
        setDisabledReason(isAssignedNow ? null : "not_assigned")
    }, [assignedPeriods])

    React.useEffect(() => {
        refreshSignInState()
        const timer = window.setInterval(refreshSignInState, 60_000)
        return () => window.clearInterval(timer)
    }, [refreshSignInState])

    // 【学习注释：签到写入前的三层防线】
    // 先做点击节流，再查当天是否已签到，最后才进入定位与写库流程。
    // 这种顺序能把最便宜的失败尽量前置，减少无意义的定位请求和数据库压力。
    const onSignIn = React.useCallback(() => {
        if (isSigningIn) return

        const nowTs = Date.now()
        const elapsed = nowTs - lastSignInAttemptAtRef.current
        if (elapsed < SIGN_IN_ATTEMPT_COOLDOWN_MS) {
            const waitSeconds = Math.max(1, Math.ceil((SIGN_IN_ATTEMPT_COOLDOWN_MS - elapsed) / 1000))
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

        if (!navigator.geolocation) {
            toast({ title: "当前设备不支持定位", description: "请使用支持定位的浏览器后重试。", variant: "destructive" })
            return
        }

        setIsSigningIn(true)

        let completed = false
        const finishSignIn = () => {
            if (completed) return false
            completed = true
            setIsSigningIn(false)
            return true
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const preCheckAndSignIn = async () => {
            // 【学习注释：写操作前先确认 session 还有足够寿命】
            // 否则定位成功后才发现 token 过期，会把用户体验变成“看起来能点，提交时失败”。
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
                if (expiresAt < Date.now() + 60000) {
                    await supabase.auth.refreshSession();
                }
            }

            try {
                const { data: existingLogs, error: existingError } = await supabase
                    .from("duty_logs")
                    .select("id")
                    .eq("member_id", memberId)
                    .gte("sign_in_time", today.toISOString())
                    .limit(1)

                if (!existingError && !!existingLogs && existingLogs.length > 0) {
                    setHasSignedInToday(true)
                    toast({ title: "今日已签到", description: "您今天已有签到记录，无需重复签到。" })
                    finishSignIn()
                    return
                }
            } catch (error) {
                console.warn("Failed to pre-check duty logs:", error)
            }

            let position: GeolocationPosition
            try {
                position = await getCurrentPositionWithFallback()
            } catch (geoError) {
                if (completed) return

                let description = "定位失败，请检查权限后重试。"
                const reason = getLocationErrorReason(geoError)

                if (reason === "permission_denied") description = "定位权限被拒绝，无法进行签到。"
                if (reason === "position_unavailable") description = "无法获取定位信息，请检查设备定位服务。"
                if (reason === "timeout") description = "定位请求超时，请稍后重试。"
                if (reason === "not_supported") description = "当前设备或浏览器不支持定位。"
                if (reason === "insecure_context") description = "请使用 HTTPS 或 localhost 访问后再试。"

                toast({ title: "签到失败", description, variant: "destructive" })
                finishSignIn()
                return
            }

            if (!position || !position.coords) {
                toast({
                    title: "定位数据异常",
                    description: "未获取到有效定位信息，请检查设备定位服务后重试。",
                    variant: "destructive",
                })
                finishSignIn()
                return
            }

            const latitude = Number(position.coords.latitude)
            const longitude = Number(position.coords.longitude)

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                toast({
                    title: "签到失败",
                    description: "定位坐标无效，请稍后重试。",
                    variant: "destructive",
                })
                finishSignIn()
                return
            }

            const distance = getDistanceFromLatLonInM(latitude, longitude, STUDIO_COORDS.lat, STUDIO_COORDS.lng)

            // 【学习注释：定位防作弊】
            // 只有坐标合法且落在允许半径内才允许写入签到记录，避免把远程打开页面也记成到场。
            if (distance > MAX_VALID_RADIUS_METERS) {
                toast({
                    title: "签到失败",
                    description: `当前位置距离工作室约 ${Math.round(distance)} 米，超出允许范围。`,
                    variant: "destructive",
                })
                finishSignIn()
                return
            }

            try {
                const { error } = await supabase.from("duty_logs").insert({
                    member_id: memberId,
                    location_verified: true,
                    device_info: window.navigator.userAgent,
                })

                if (error) throw error

                setHasSignedInToday(true)
                refreshSignInState()
                toast({ title: "签到成功", description: "已完成位置验证并记录到值班考勤。" })
            } catch (error: unknown) {
                const typedError = error as { code?: string; message?: string }
                if (typedError?.code === "23505") {
                    setHasSignedInToday(true)
                    toast({ title: "今日已签到", description: "检测到重复签到请求，系统已自动拦截。" })
                } else {
                    toast({
                        title: "签到失败",
                        description: typedError?.message || "无法写入签到记录，请稍后重试。",
                        variant: "destructive",
                    })
                }
            } finally {
                finishSignIn()
            }
        }

        void preCheckAndSignIn()
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
