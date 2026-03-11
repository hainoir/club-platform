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
                title: "??????",
                description: `?? ${waitSeconds} ???????`,
                variant: "destructive",
            })
            return
        }
        lastSignInAttemptAtRef.current = nowTs

        if (!memberId) {
            toast({ title: "????", description: "?????????????????", variant: "destructive" })
            return
        }

        if (hasSignedInToday) {
            toast({ title: "?????", description: "???????????????" })
            return
        }

        if (!navigator.geolocation) {
            toast({ title: "?????????", description: "???????????????", variant: "destructive" })
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

        const geolocationWatchdog = window.setTimeout(() => {
            if (!finishSignIn()) return
            toast({ title: "??????", description: "?????????????????????", variant: "destructive" })
        }, 15_000)

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
                    window.clearTimeout(geolocationWatchdog)
                    setHasSignedInToday(true)
                    toast({ title: "?????", description: "???????????????" })
                    finishSignIn()
                    return
                }
            } catch (error) {
                console.warn("Failed to pre-check duty logs:", error)
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    if (completed) return
                    window.clearTimeout(geolocationWatchdog)

                    if (!position || !position.coords) {
                        toast({
                            title: "????",
                            description: "????????????????????????",
                            variant: "destructive",
                        })
                        finishSignIn()
                        return
                    }

                    const latitude = Number(position.coords.latitude)
                    const longitude = Number(position.coords.longitude)

                    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                        toast({
                            title: "????",
                            description: "????????????????????",
                            variant: "destructive",
                        })
                        finishSignIn()
                        return
                    }

                    const distance = getDistanceFromLatLonInM(latitude, longitude, STUDIO_COORDS.lat, STUDIO_COORDS.lng)

                    if (distance > MAX_VALID_RADIUS_METERS) {
                        toast({
                            title: "????",
                            description: `?????????? ${Math.round(distance)} ?????????`,
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
                        toast({ title: "????", description: "????????????????" })
                    } catch (error: unknown) {
                        const typedError = error as { code?: string; message?: string }
                        if (typedError?.code === "23505") {
                            setHasSignedInToday(true)
                            toast({ title: "?????", description: "??????????????????" })
                        } else {
                            toast({
                                title: "????",
                                description: typedError?.message || "???????????????",
                                variant: "destructive",
                            })
                        }
                    } finally {
                        finishSignIn()
                    }
                },
                (geoError) => {
                    if (completed) return
                    window.clearTimeout(geolocationWatchdog)

                    let description = "???????????"
                    if (geoError.code === geoError.PERMISSION_DENIED) description = "???????????????"
                    if (geoError.code === geoError.POSITION_UNAVAILABLE) description = "???????????????????"
                    if (geoError.code === geoError.TIMEOUT) description = "?????????????"

                    toast({ title: "????", description, variant: "destructive" })
                    finishSignIn()
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10_000,
                    maximumAge: 0,
                }
            )
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
