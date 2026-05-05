import { isChinaPublicHoliday } from "./china-public-holidays.ts"
import { toDutyDateTimeParts } from "./duty-time.ts"
import {
    getStudioLocationErrorMessage,
    isStudioLocationValidationFailure,
    validateStudioLocation,
} from "./studio-location.ts"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/supabase"

export const DUTY_SIGN_IN_PERIOD_RANGES: Record<number, [number, number]> = {
    1: [8 * 60, 9 * 60 + 35],
    2: [10 * 60 + 5, 11 * 60 + 40],
    3: [13 * 60 + 30, 15 * 60 + 5],
    4: [15 * 60 + 35, 17 * 60 + 10],
}

export const DUTY_SIGN_IN_ACTION_COOLDOWN_MS = 5000

export type DutyAvailabilityReason = "not_in_period" | "not_assigned" | "holiday" | null
export type DutySignInResult = "signed_in" | "already_signed_in"
export type DutySignInFailureReason = "location" | "write"

export interface CurrentDutyAvailability {
    canSignInNow: boolean
    disabledReason: DutyAvailabilityReason
}

export class DutySignInError extends Error {
    reason: DutySignInFailureReason
    originalError?: unknown

    constructor(reason: DutySignInFailureReason, message: string, originalError?: unknown) {
        super(message)
        this.name = "DutySignInError"
        this.reason = reason
        this.originalError = originalError
    }
}

export function resolveCurrentDutyAvailability(
    assignedPeriods: ReadonlyArray<number>,
    now: Date = new Date()
): CurrentDutyAvailability {
    const nowParts = toDutyDateTimeParts(now)
    const todayDow = nowParts.dayOfWeek
    const nowMinutes = nowParts.minutes

    if (isChinaPublicHoliday(nowParts.dateKey)) {
        return { canSignInNow: false, disabledReason: "holiday" }
    }

    if (todayDow < 1 || todayDow > 5) {
        return { canSignInNow: false, disabledReason: "not_in_period" }
    }

    const activePeriods = Object.entries(DUTY_SIGN_IN_PERIOD_RANGES)
        .filter(([, [start, end]]) => nowMinutes >= start && nowMinutes <= end)
        .map(([period]) => Number(period))

    if (activePeriods.length === 0) {
        return { canSignInNow: false, disabledReason: "not_in_period" }
    }

    const normalizedAssignedPeriods = new Set(
        assignedPeriods.filter((period) => Object.prototype.hasOwnProperty.call(DUTY_SIGN_IN_PERIOD_RANGES, period))
    )
    const canSignInNow = activePeriods.some((period) => normalizedAssignedPeriods.has(period))

    return {
        canSignInNow,
        disabledReason: canSignInNow ? null : "not_assigned",
    }
}

export async function submitDutySignIn(options: {
    supabase: SupabaseClient<Database>
    memberId: string
    deviceInfo?: string
}): Promise<DutySignInResult> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    try {
        const { data: existingLogs, error: existingError } = await options.supabase
            .from("duty_logs")
            .select("id")
            .eq("member_id", options.memberId)
            .gte("sign_in_time", today.toISOString())
            .limit(1)

        if (!existingError && !!existingLogs && existingLogs.length > 0) {
            return "already_signed_in"
        }
    } catch (error) {
        console.warn("Failed to pre-check duty logs:", error)
    }

    try {
        await validateStudioLocation()
    } catch (error) {
        throw new DutySignInError("location", getStudioLocationErrorMessage(error), error)
    }

    try {
        const { error } = await options.supabase.from("duty_logs").insert({
            member_id: options.memberId,
            location_verified: true,
            device_info: options.deviceInfo ?? null,
        })

        if (error) throw error
        return "signed_in"
    } catch (error) {
        const typedError = error as { code?: string; message?: string }
        if (typedError?.code === "23505") {
            return "already_signed_in"
        }

        throw new DutySignInError(
            "write",
            typedError?.message || "无法写入签到记录，请稍后重试。",
            error
        )
    }
}

export function getDutySignInErrorMessage(error: unknown): string {
    if (error instanceof DutySignInError) {
        if (error.reason === "location" && isStudioLocationValidationFailure(error.originalError)) {
            return getStudioLocationErrorMessage(error.originalError)
        }

        return error.message
    }

    return "无法写入签到记录，请稍后重试。"
}
