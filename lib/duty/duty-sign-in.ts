import { isChinaPublicHoliday } from "./china-public-holidays.ts"
import { toDutyDateTimeParts } from "./duty-time.ts"
import {
    getStudioLocationErrorMessage,
    isStudioLocationValidationFailure,
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
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    try {
        // 【学习注释：先做最便宜的重复签到预检】
        // 能在写库前直接拦住明显重复请求，减少无意义的定位校验和唯一键冲突。
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
        // 【学习注释：定位校验是业务规则，不是 UI 装饰】
        // 只有通过工作室定位验证后，才允许把签到写进 duty_logs。
        await validateStudioLocation()
    } catch (error) {
        throw new DutySignInError("location", getStudioLocationErrorMessage(error), error)
    }

    try {
        // 【学习注释：真正的签到事实只认数据库写入】
        // 前端不会自己缓存“签到成功”作为最终真相，而是等写库结果返回后再更新界面。
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
