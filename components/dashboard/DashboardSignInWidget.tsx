"use client"

import * as React from "react"

import { SignInCard } from "@/components/duty/SignInCard"
import { useToast } from "@/components/ui/toast-simple"
import { getCurrentPositionWithFallback, getLocationErrorReason } from "@/lib/geolocation"
import { createClient } from "@/utils/supabase/client"

const PERIOD_RANGES: Record<number, [number, number]> = {
    1: [8 * 60, 9 * 60 + 35],
    2: [10 * 60 + 5, 11 * 60 + 40],
    3: [13 * 60 + 30, 15 * 60 + 5],
    4: [15 * 60 + 35, 17 * 60 + 10],
}

const DEFAULT_STUDIO_COORDS = {
    lat: 39.182216,
    lng: 117.127909,
}

const DEFAULT_MAX_VALID_RADIUS_METERS = 50
const SIGN_IN_ATTEMPT_COOLDOWN_MS = 5000

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

                let description = "\u5b9a\u4f4d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6743\u9650\u540e\u91cd\u8bd5\u3002"
                const reason = getLocationErrorReason(geoError)

                if (reason === "permission_denied") description = "\u5b9a\u4f4d\u6743\u9650\u88ab\u62d2\u7edd\uff0c\u65e0\u6cd5\u8fdb\u884c\u7b7e\u5230\u3002"
                if (reason === "position_unavailable") description = "\u65e0\u6cd5\u83b7\u53d6\u5b9a\u4f4d\u4fe1\u606f\uff0c\u8bf7\u68c0\u67e5\u8bbe\u5907\u5b9a\u4f4d\u670d\u52a1\u3002"
                if (reason === "timeout") description = "\u5b9a\u4f4d\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
                if (reason === "not_supported") description = "\u5f53\u524d\u8bbe\u5907\u6216\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u5b9a\u4f4d\u3002"
                if (reason === "insecure_context") description = "\u8bf7\u4f7f\u7528 HTTPS \u6216 localhost \u8bbf\u95ee\u540e\u518d\u8bd5\u3002"

                toast({ title: "\u7b7e\u5230\u5931\u8d25", description, variant: "destructive" })
                finishSignIn()
                return
            }

            if (!position || !position.coords) {
                toast({
                    title: "\u5b9a\u4f4d\u6570\u636e\u5f02\u5e38",
                    description: "\u672a\u83b7\u53d6\u5230\u6709\u6548\u5b9a\u4f4d\u4fe1\u606f\uff0c\u8bf7\u68c0\u67e5\u8bbe\u5907\u5b9a\u4f4d\u670d\u52a1\u540e\u91cd\u8bd5\u3002",
                    variant: "destructive",
                })
                finishSignIn()
                return
            }

            const latitude = Number(position.coords.latitude)
            const longitude = Number(position.coords.longitude)

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                toast({
                    title: "\u7b7e\u5230\u5931\u8d25",
                    description: "\u5b9a\u4f4d\u5750\u6807\u65e0\u6548\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
                    variant: "destructive",
                })
                finishSignIn()
                return
            }

            const distance = getDistanceFromLatLonInM(latitude, longitude, STUDIO_COORDS.lat, STUDIO_COORDS.lng)

            if (distance > MAX_VALID_RADIUS_METERS) {
                toast({
                    title: "\u7b7e\u5230\u5931\u8d25",
                    description: `\u5f53\u524d\u4f4d\u7f6e\u8ddd\u79bb\u5de5\u4f5c\u5ba4\u7ea6 ${Math.round(distance)} \u7c73\uff0c\u8d85\u51fa\u5141\u8bb8\u8303\u56f4\u3002`,
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
                toast({ title: "\u7b7e\u5230\u6210\u529f", description: "\u5df2\u5b8c\u6210\u4f4d\u7f6e\u9a8c\u8bc1\u5e76\u8bb0\u5f55\u5230\u503c\u73ed\u8003\u52e4\u3002" })
            } catch (error: unknown) {
                const typedError = error as { code?: string; message?: string }
                if (typedError?.code === "23505") {
                    setHasSignedInToday(true)
                    toast({ title: "\u4eca\u65e5\u5df2\u7b7e\u5230", description: "\u68c0\u6d4b\u5230\u91cd\u590d\u7b7e\u5230\u8bf7\u6c42\uff0c\u7cfb\u7edf\u5df2\u81ea\u52a8\u62e6\u622a\u3002" })
                } else {
                    toast({
                        title: "\u7b7e\u5230\u5931\u8d25",
                        description: typedError?.message || "\u65e0\u6cd5\u5199\u5165\u7b7e\u5230\u8bb0\u5f55\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
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
