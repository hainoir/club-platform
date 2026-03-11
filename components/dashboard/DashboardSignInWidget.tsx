"use client"

import * as React from "react"

import { SignInCard } from "@/components/duty/SignInCard"
import { useToast } from "@/components/ui/toast-simple"
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
        if (!memberId) {
            toast({ title: "无法签到", description: "未找到当前成员档案，请联系管理员。", variant: "destructive" })
            return
        }

        if (!navigator.geolocation) {
            toast({ title: "当前设备不支持定位", description: "请使用支持定位的浏览器后重试。", variant: "destructive" })
            return
        }

        setIsSigningIn(true)

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords
                const distance = getDistanceFromLatLonInM(latitude, longitude, STUDIO_COORDS.lat, STUDIO_COORDS.lng)

                if (distance > MAX_VALID_RADIUS_METERS) {
                    toast({
                        title: "签到失败",
                        description: `当前位置距离工作室约 ${Math.round(distance)} 米，超出允许范围。`,
                        variant: "destructive",
                    })
                    setIsSigningIn(false)
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
                    toast({
                        title: "签到失败",
                        description: (error as Error).message || "无法写入签到记录，请稍后重试。",
                        variant: "destructive",
                    })
                } finally {
                    setIsSigningIn(false)
                }
            },
            (geoError) => {
                let description = "请检查定位权限后重试。"
                if (geoError.code === geoError.PERMISSION_DENIED) description = "定位权限被拒绝，无法进行签到。"
                if (geoError.code === geoError.POSITION_UNAVAILABLE) description = "无法获取定位信息，请检查设备定位服务。"
                if (geoError.code === geoError.TIMEOUT) description = "定位请求超时，请稍后重试。"

                toast({ title: "签到失败", description, variant: "destructive" })
                setIsSigningIn(false)
            },
            {
                enableHighAccuracy: true,
                timeout: 10_000,
                maximumAge: 0,
            }
        )
    }, [memberId, refreshSignInState, supabase, toast])

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
