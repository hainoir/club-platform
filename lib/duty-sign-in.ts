import { isChinaPublicHoliday } from "./china-public-holidays.ts"
import { toDutyDateTimeParts } from "./duty-time.ts"

export const DUTY_SIGN_IN_PERIOD_RANGES: Record<number, [number, number]> = {
    1: [8 * 60, 9 * 60 + 35],
    2: [10 * 60 + 5, 11 * 60 + 40],
    3: [13 * 60 + 30, 15 * 60 + 5],
    4: [15 * 60 + 35, 17 * 60 + 10],
}

export type DutyAvailabilityReason = "not_in_period" | "not_assigned" | "holiday" | null

export interface CurrentDutyAvailability {
    canSignInNow: boolean
    disabledReason: DutyAvailabilityReason
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
