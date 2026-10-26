import { isChinaPublicHoliday } from "./china-public-holidays.ts"
import { getDutyNow, toDutyDateTimeParts } from "./duty-time.ts"
import {
    getStudioLocationErrorMessage,
    isStudioLocationValidationFailure,
    loadStudioGeofence,
    validateStudioLocation,
} from "../studio/studio-location.ts"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/supabase"

import { DUTY_SIGN_IN_PERIOD_RANGES } from "./duty-constants.ts"
export { DUTY_SIGN_IN_PERIOD_RANGES }

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

/**
 * 【学习注释：前端的“是否可签到”只做快速交互判断】
 * 这里根据当前时间、节次窗口、节假日和本人排班先决定按钮状态，
 * 但它不是最终事实；真正提交前仍然会继续做重复签到和定位校验。
 */
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
    // memberId 是调用方手里的登录用户 id，不能拿来判断今天有没有签到。
    // 成员档案可能和 auth.uid() 不是同一行，以 current_member_id() 为准。
    void options.memberId

    let resolvedMemberId: string | null = null
    try {
        const { data, error } = await options.supabase.rpc("current_member_id")
        if (error) {
            console.warn("Failed to resolve current member:", error)
        } else if (typeof data === "string" && data.length > 0) {
            resolvedMemberId = data
        } else {
            throw new DutySignInError("write", "未找到当前成员档案，请联系管理员。")
        }
    } catch (error) {
        if (error instanceof DutySignInError) throw error
        console.warn("Failed to resolve current member:", error)
    }

    if (resolvedMemberId) {
        try {
            const todayKey = getDutyNow().dateKey
            const { data: existingLogs, error: existingError } = await options.supabase
                .from("duty_logs")
                .select("id")
                .eq("member_id", resolvedMemberId)
                .eq("sign_in_date", todayKey)
                .limit(1)

            if (!existingError && !!existingLogs && existingLogs.length > 0) {
                return "already_signed_in"
            }
        } catch (error) {
            console.warn("Failed to pre-check duty logs:", error)
        }
    }

    let location: Awaited<ReturnType<typeof validateStudioLocation>>
    try {
        // 浏览器判断只用来提前提示。圆心和半径来自 studio_geofence，
        // 真正能否写入由 submit_duty_sign_in 和 duty_logs 上的围栏触发器决定。
        const fence = await loadStudioGeofence(options.supabase)
        location = await validateStudioLocation(fence)
    } catch (error) {
        throw new DutySignInError("location", getStudioLocationErrorMessage(error), error)
    }

    try {
        const { data, error } = await options.supabase.rpc("submit_duty_sign_in", {
            p_latitude: location.latitude,
            p_longitude: location.longitude,
            p_accuracy: location.accuracy,
            p_device_info: options.deviceInfo,
        })

        if (error) throw error
        if (data === "already_signed_in") return "already_signed_in"
        if (data === "signed_in") return "signed_in"

        throw new DutySignInError("write", "无法写入签到记录，请稍后重试。")
    } catch (error) {
        if (error instanceof DutySignInError) throw error

        const typedError = error as { code?: string; message?: string }
        if (typedError?.code === "23505") {
            return "already_signed_in"
        }

        const geofenceMessage = describeDutySignInGeofenceRejection(error)
        throw new DutySignInError(
            geofenceMessage ? "location" : "write",
            geofenceMessage || typedError?.message || "无法写入签到记录，请稍后重试。",
            error
        )
    }
}

function readErrorField(error: unknown, field: "hint" | "details"): string | null {
    if (!error || typeof error !== "object") return null
    const value = (error as Record<string, unknown>)[field]
    return typeof value === "string" ? value : null
}

function describeGeofenceRejection(error: unknown): string | null {
    const hint = readErrorField(error, "hint")
    if (!hint) return null

    const details = readErrorField(error, "details")
    const numericDetails = details === null ? null : Number(details.trim())
    const rounded = numericDetails !== null && Number.isFinite(numericDetails) ? Math.round(numericDetails) : null

    switch (hint) {
        case "out_of_range":
            return rounded === null
                ? "当前位置超出工作室允许范围。"
                : `当前位置距离工作室约 ${rounded} 米，超出允许范围。`
        case "insufficient_accuracy":
            return rounded === null
                ? "当前定位精度不足，请移动到开阔区域后重试。"
                : `当前定位精度约 ${rounded} 米，请移动到开阔区域后重试。`
        case "invalid_coordinates":
            return "定位坐标无效，请稍后重试。"
        case "invalid_accuracy":
            return "定位精度异常，请稍后重试。"
        case "geofence_unconfigured":
            return "工作室地理围栏尚未配置，请联系管理员。"
        case "holiday":
            return "今日为公共假日，不记录值班签到。"
        case "outside_shift_window":
            return "当前不在值班签到时段。"
        case "not_rostered":
            return "当前节次没有你的排班，不能签到。"
        default:
            return null
    }
}

function describeDutySignInGeofenceRejection(error: unknown): string | null {
    const direct = describeGeofenceRejection(error)
    if (direct) return direct
    if (error instanceof DutySignInError) return describeGeofenceRejection(error.originalError)
    return null
}

export function getDutySignInErrorMessage(error: unknown): string {
    const geofenceMessage = describeDutySignInGeofenceRejection(error)
    if (geofenceMessage) return geofenceMessage

    if (error instanceof DutySignInError) {
        if (error.reason === "location" && isStudioLocationValidationFailure(error.originalError)) {
            return getStudioLocationErrorMessage(error.originalError)
        }

        return error.message
    }

    return "无法写入签到记录，请稍后重试。"
}
