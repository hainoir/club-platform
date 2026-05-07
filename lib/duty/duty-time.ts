import { isDutyRequiredDate } from "./china-public-holidays.ts"
import { PERIOD_END_MINUTES } from "./duty-constants.ts"

export const DUTY_TIME_ZONE = "Asia/Shanghai"

const TIME_PARTS_FORMATTER_LOCALE = "en-US"

const formatters = new Map<string, Intl.DateTimeFormat>()

export interface DutyDateTimeParts {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
    dateKey: string
    dayOfWeek: number
    minutes: number
}

export interface DutySignInLogLike {
    member_id: string
    sign_in_time: string
    sign_in_date?: string | null
}

export interface DutySignInSlot {
    memberId: string
    dateKey: string
    dayOfWeek: number
    period: number
    slotKey: string
    signedAtLabel: string
}

export interface DutyCompensationSlot {
    dateKey: string
    dayOfWeek: number
    period: number
    weekOffset: 0 | 1
}

function pad2(value: number): string {
    return String(value).padStart(2, "0")
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
    const cacheKey = `${TIME_PARTS_FORMATTER_LOCALE}|${timeZone}`
    const existing = formatters.get(cacheKey)
    if (existing) return existing

    const formatter = new Intl.DateTimeFormat(TIME_PARTS_FORMATTER_LOCALE, {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    })

    formatters.set(cacheKey, formatter)
    return formatter
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
    const item = parts.find((entry) => entry.type === type)
    if (!item) {
        throw new Error(`Missing time part: ${type}`)
    }
    const value = Number(item.value)
    if (!Number.isFinite(value)) {
        throw new Error(`Invalid time part value for ${type}: ${item.value}`)
    }
    return value
}

function normalizeDateInput(input: Date | string | number): Date {
    const date = input instanceof Date ? input : new Date(input)
    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid date input")
    }
    return date
}

function splitDateKey(dateKey: string): { year: number; month: number; day: number } {
    const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
    if (!matched) {
        throw new Error(`Invalid date key: ${dateKey}`)
    }
    return {
        year: Number(matched[1]),
        month: Number(matched[2]),
        day: Number(matched[3]),
    }
}

function safeDateKey(dateKey: string | null | undefined): string | null {
    if (!dateKey) return null
    const normalized = dateKey.trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

export function toDutyDateTimeParts(input: Date | string | number, timeZone = DUTY_TIME_ZONE): DutyDateTimeParts {
    const date = normalizeDateInput(input)
    const formatter = getFormatter(timeZone)
    const parts = formatter.formatToParts(date)

    const year = getPart(parts, "year")
    const month = getPart(parts, "month")
    const day = getPart(parts, "day")
    const hour = getPart(parts, "hour")
    const minute = getPart(parts, "minute")
    const second = getPart(parts, "second")

    const dateKey = `${year}-${pad2(month)}-${pad2(day)}`
    const dayOfWeek = getDayOfWeekFromDateKey(dateKey)

    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        dateKey,
        dayOfWeek,
        minutes: hour * 60 + minute,
    }
}

export function getDutyNow(timeZone = DUTY_TIME_ZONE): DutyDateTimeParts {
    return toDutyDateTimeParts(new Date(), timeZone)
}

export function getDayOfWeekFromDateKey(dateKey: string): number {
    const { year, month, day } = splitDateKey(dateKey)
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function addDaysToDateKey(dateKey: string, days: number): string {
    const { year, month, day } = splitDateKey(dateKey)
    const shifted = new Date(Date.UTC(year, month - 1, day + days))
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

export function getDutyWeekMondayDateKey(input: Date | string | number, timeZone = DUTY_TIME_ZONE): string {
    const parts = toDutyDateTimeParts(input, timeZone)
    const diff = parts.dayOfWeek === 0 ? -6 : 1 - parts.dayOfWeek
    return addDaysToDateKey(parts.dateKey, diff)
}

export function getDutyPeriodByMinutes(minutes: number): number {
    if (minutes >= 7 * 60 + 30 && minutes <= PERIOD_END_MINUTES[1]) return 1
    if (minutes >= PERIOD_END_MINUTES[1] && minutes <= PERIOD_END_MINUTES[2]) return 2
    if (minutes >= 13 * 60 && minutes <= PERIOD_END_MINUTES[3]) return 3
    if (minutes >= PERIOD_END_MINUTES[3] && minutes <= PERIOD_END_MINUTES[4]) return 4
    return 0
}

export function getDutyPeriodEndMinutes(period: number): number {
    return PERIOD_END_MINUTES[period] || 24 * 60
}

export function getNextDutySlotDateKey(
    dayOfWeek: number,
    period: number,
    input: Date | string | number = new Date(),
    timeZone = DUTY_TIME_ZONE
): string {
    if (dayOfWeek < 1 || dayOfWeek > 5) {
        throw new Error(`Invalid duty day: ${dayOfWeek}`)
    }

    const nowParts = toDutyDateTimeParts(input, timeZone)
    const currentWeekMondayDateKey = getDutyWeekMondayDateKey(input, timeZone)
    let slotDateKey = addDaysToDateKey(currentWeekMondayDateKey, dayOfWeek - 1)

    while (
        !isDutyRequiredDate(slotDateKey) ||
        slotDateKey < nowParts.dateKey ||
        (slotDateKey === nowParts.dateKey && nowParts.minutes > getDutyPeriodEndMinutes(period))
    ) {
        slotDateKey = addDaysToDateKey(slotDateKey, 7)
    }

    return slotDateKey
}

export function listCompensationSlotsForDuty(
    dayOfWeek: number,
    period: number,
    input: Date | string | number = new Date(),
    timeZone = DUTY_TIME_ZONE
): DutyCompensationSlot[] {
    const leaveDateKey = getNextDutySlotDateKey(dayOfWeek, period, input, timeZone)
    const leaveWeekMondayDateKey = addDaysToDateKey(leaveDateKey, 1 - dayOfWeek)
    const nextWeekMondayDateKey = addDaysToDateKey(leaveWeekMondayDateKey, 7)
    const slots: DutyCompensationSlot[] = []

    for (let currentDay = dayOfWeek; currentDay <= 5; currentDay += 1) {
        const dateKey = addDaysToDateKey(leaveWeekMondayDateKey, currentDay - 1)
        if (!isDutyRequiredDate(dateKey)) continue

        for (let currentPeriod = 1; currentPeriod <= 4; currentPeriod += 1) {
            if (currentDay === dayOfWeek && currentPeriod <= period) continue
            slots.push({
                dateKey,
                dayOfWeek: currentDay,
                period: currentPeriod,
                weekOffset: 0,
            })
        }
    }

    for (let currentDay = 1; currentDay <= 5; currentDay += 1) {
        const dateKey = addDaysToDateKey(nextWeekMondayDateKey, currentDay - 1)
        if (!isDutyRequiredDate(dateKey)) continue

        for (let currentPeriod = 1; currentPeriod <= 4; currentPeriod += 1) {
            slots.push({
                dateKey,
                dayOfWeek: currentDay,
                period: currentPeriod,
                weekOffset: 1,
            })
        }
    }

    return slots
}

export function resolveDutySignInSlot(log: DutySignInLogLike, timeZone = DUTY_TIME_ZONE): DutySignInSlot | null {
    try {
        const signInParts = toDutyDateTimeParts(log.sign_in_time, timeZone)
        const period = getDutyPeriodByMinutes(signInParts.minutes)
        const dateKey = safeDateKey(log.sign_in_date) || signInParts.dateKey
        const dayOfWeek = getDayOfWeekFromDateKey(dateKey)

        if (period === 0 || !isDutyRequiredDate(dateKey)) {
            return null
        }

        return {
            memberId: log.member_id,
            dateKey,
            dayOfWeek,
            period,
            slotKey: `${log.member_id}-${dateKey}-${period}`,
            signedAtLabel: `${pad2(signInParts.hour)}:${pad2(signInParts.minute)}`,
        }
    } catch {
        return null
    }
}
