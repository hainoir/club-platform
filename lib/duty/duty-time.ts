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

    const year = Number(matched[1])
    const month = Number(matched[2])
    const day = Number(matched[3])
    const date = new Date(0)
    date.setUTCFullYear(year, month - 1, day)
    date.setUTCHours(0, 0, 0, 0)

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`Invalid date key: ${dateKey}`)
    }

    return { year, month, day }
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

export interface DutyLeaveTimeLike {
    day_of_week: number
    period: number
    leave_date: string
    expires_at: string
}

function isWorkday(dayOfWeek: number): boolean {
    return Number.isInteger(dayOfWeek) && dayOfWeek >= 1 && dayOfWeek <= 5
}

function isValidDutyPeriod(period: number): boolean {
    return typeof period === "number" && Number.isInteger(period) && period >= 1 && period <= 4
}

function parseUtcIsoDateTime(value: string): Date | null {
    const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/.exec(value)
    if (!matched) return null

    try {
        const year = Number(matched[1])
        const month = Number(matched[2])
        const day = Number(matched[3])
        const hour = Number(matched[4])
        const minute = Number(matched[5])
        const second = Number(matched[6])
        const millisecond = Number((matched[7] || "").slice(0, 3).padEnd(3, "0"))
        splitDateKey(`${matched[1]}-${matched[2]}-${matched[3]}`)

        const date = new Date(value)
        if (
            Number.isNaN(date.getTime()) ||
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day ||
            date.getUTCHours() !== hour ||
            date.getUTCMinutes() !== minute ||
            date.getUTCSeconds() !== second ||
            date.getUTCMilliseconds() !== millisecond
        ) {
            return null
        }

        return date
    } catch {
        return null
    }
}

function getWeekMondayFromDateKey(dateKey: string): string {
    const dayOfWeek = getDayOfWeekFromDateKey(dateKey)
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    return addDaysToDateKey(dateKey, offset)
}

export function getNextDutyLeaveDateKey(
    dayOfWeek: number,
    period: number,
    nowInput: Date | string | number = new Date(),
): string {
    if (!isWorkday(dayOfWeek) || !isValidDutyPeriod(period)) {
        throw new Error("Invalid duty leave slot")
    }

    return getNextDutySlotDateKey(dayOfWeek, period, nowInput)
}

export function isDutyLeaveDateSelectable(
    leaveDate: string,
    dayOfWeek: number,
    period: number,
    nowInput: Date | string | number = new Date(),
): boolean {
    try {
        if (
            !isWorkday(dayOfWeek) ||
            !isValidDutyPeriod(period) ||
            getDayOfWeekFromDateKey(leaveDate) !== dayOfWeek ||
            !isDutyRequiredDate(leaveDate)
        ) {
            return false
        }

        const periodEndMinutes = getDutyPeriodEndMinutes(period)
        const now = toDutyDateTimeParts(nowInput)
        if (leaveDate > now.dateKey) return true
        if (leaveDate < now.dateKey) return false
        return now.minutes < periodEndMinutes
    } catch {
        return false
    }
}

export function isCurrentDutyLeave(
    leave: DutyLeaveTimeLike,
    nowInput: Date | string | number = new Date(),
): boolean {
    try {
        const now = toDutyDateTimeParts(nowInput)
        const expiresAt = parseUtcIsoDateTime(leave.expires_at)
        if (!expiresAt) return false

        return (
            isDutyLeaveDateSelectable(leave.leave_date, leave.day_of_week, leave.period, nowInput) &&
            getWeekMondayFromDateKey(leave.leave_date) === getWeekMondayFromDateKey(now.dateKey) &&
            expiresAt.getTime() > normalizeDateInput(nowInput).getTime()
        )
    } catch {
        return false
    }
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
        (slotDateKey === nowParts.dateKey && nowParts.minutes >= getDutyPeriodEndMinutes(period))
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
