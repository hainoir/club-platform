import { DUTY_TIME_ZONE, getDutyWeekMondayDateKey } from "../duty/duty-time.ts"

export interface StudioSessionLike {
    member_id: string
    started_at: string
    ended_at: string | null
    is_active: boolean | null
    member?: {
        name: string | null
    } | null
}

export interface StudioStudySummary {
    todayMinutes: number
    weekMinutes: number
    monthMinutes: number
    semesterMinutes: number
    totalMinutes: number
    activeCount: number
}

export interface StudioStudyLeaderboardEntry {
    memberId: string
    name: string
    todayMinutes: number
    weekMinutes: number
    monthMinutes: number
    semesterMinutes: number
    totalMinutes: number
    isActive: boolean
}

export interface StudioStudyLeaderboard {
    activeCount: number
    today: StudioStudyLeaderboardEntry[]
    week: StudioStudyLeaderboardEntry[]
    month: StudioStudyLeaderboardEntry[]
    semester: StudioStudyLeaderboardEntry[]
    total: StudioStudyLeaderboardEntry[]
}

interface ZonedDateTimeParts {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
    dateKey: string
}

const FORMATTER_LOCALE = "en-US"
const MINUTE_MS = 60_000

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function pad2(value: number): string {
    return String(value).padStart(2, "0")
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
    const cacheKey = `${FORMATTER_LOCALE}|${timeZone}`
    const existing = formatterCache.get(cacheKey)
    if (existing) return existing

    const formatter = new Intl.DateTimeFormat(FORMATTER_LOCALE, {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
    })

    formatterCache.set(cacheKey, formatter)
    return formatter
}

function getNumericPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
    const part = parts.find((entry) => entry.type === type)
    if (!part) {
        throw new Error(`Missing time part: ${type}`)
    }

    const value = Number(part.value)
    if (!Number.isFinite(value)) {
        throw new Error(`Invalid time part value for ${type}: ${part.value}`)
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

function toZonedDateTimeParts(input: Date | string | number, timeZone = DUTY_TIME_ZONE): ZonedDateTimeParts {
    const date = normalizeDateInput(input)
    const parts = getFormatter(timeZone).formatToParts(date)

    const year = getNumericPart(parts, "year")
    const month = getNumericPart(parts, "month")
    const day = getNumericPart(parts, "day")
    const hour = getNumericPart(parts, "hour")
    const minute = getNumericPart(parts, "minute")
    const second = getNumericPart(parts, "second")

    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
    }
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
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

function dateKeyToZonedEpochMs(dateKey: string): number {
    const { year, month, day } = parseDateKey(dateKey)
    return Date.UTC(year, month - 1, day, 0, 0, 0, 0)
}

function toZonedEpochMs(input: Date | string | number, timeZone = DUTY_TIME_ZONE): number {
    const parts = toZonedDateTimeParts(input, timeZone)
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0)
}

function getMonthStartDateKey(input: Date | string | number, timeZone = DUTY_TIME_ZONE): string {
    const parts = toZonedDateTimeParts(input, timeZone)
    return `${parts.year}-${pad2(parts.month)}-01`
}

export function getSemesterStartDateKey(input: Date | string | number, timeZone = DUTY_TIME_ZONE): string {
    const parts = toZonedDateTimeParts(input, timeZone)

    if (parts.month >= 2 && parts.month <= 8) {
        return `${parts.year}-02-01`
    }

    if (parts.month === 1) {
        return `${parts.year - 1}-09-01`
    }

    return `${parts.year}-09-01`
}

function getOverlapMs(startMs: number, endMs: number, windowStartMs: number, windowEndMs: number): number {
    if (endMs <= startMs || windowEndMs <= windowStartMs) return 0

    const overlapStartMs = Math.max(startMs, windowStartMs)
    const overlapEndMs = Math.min(endMs, windowEndMs)
    return Math.max(overlapEndMs - overlapStartMs, 0)
}

function toWholeMinutes(durationMs: number): number {
    return Math.max(Math.floor(durationMs / MINUTE_MS), 0)
}

export function formatDurationMinutes(totalMinutes: number): string {
    const safeMinutes = Math.max(Math.floor(totalMinutes), 0)
    const hours = Math.floor(safeMinutes / 60)
    const minutes = safeMinutes % 60

    if (hours === 0) {
        return `${minutes} 分钟`
    }

    if (minutes === 0) {
        return `${hours} 小时`
    }

    return `${hours} 小时 ${minutes} 分钟`
}

export function summarizeStudioStudySessions(
    sessions: ReadonlyArray<StudioSessionLike>,
    nowInput: Date | string | number = new Date(),
    timeZone = DUTY_TIME_ZONE
): StudioStudySummary {
    const nowMs = toZonedEpochMs(nowInput, timeZone)
    const nowParts = toZonedDateTimeParts(nowInput, timeZone)
    const todayStartMs = dateKeyToZonedEpochMs(nowParts.dateKey)
    const weekStartMs = dateKeyToZonedEpochMs(getDutyWeekMondayDateKey(nowInput, timeZone))
    const monthStartMs = dateKeyToZonedEpochMs(getMonthStartDateKey(nowInput, timeZone))
    const semesterStartMs = dateKeyToZonedEpochMs(getSemesterStartDateKey(nowInput, timeZone))

    let todayMs = 0
    let weekMs = 0
    let monthMs = 0
    let semesterMs = 0
    let totalMs = 0

    const activeCount = sessions.reduce((count, session) => count + (session.is_active ? 1 : 0), 0)

    sessions.forEach((session) => {
        try {
            const startMs = toZonedEpochMs(session.started_at, timeZone)
            const endMs = session.ended_at ? toZonedEpochMs(session.ended_at, timeZone) : nowMs

            if (endMs <= startMs) return

            todayMs += getOverlapMs(startMs, endMs, todayStartMs, nowMs)
            weekMs += getOverlapMs(startMs, endMs, weekStartMs, nowMs)
            monthMs += getOverlapMs(startMs, endMs, monthStartMs, nowMs)
            semesterMs += getOverlapMs(startMs, endMs, semesterStartMs, nowMs)
            totalMs += endMs - startMs
        } catch {
            return
        }
    })

    return {
        todayMinutes: toWholeMinutes(todayMs),
        weekMinutes: toWholeMinutes(weekMs),
        monthMinutes: toWholeMinutes(monthMs),
        semesterMinutes: toWholeMinutes(semesterMs),
        totalMinutes: toWholeMinutes(totalMs),
        activeCount,
    }
}

function sortLeaderboardEntries(
    entries: Iterable<StudioStudyLeaderboardEntry>,
    metric: keyof Pick<
        StudioStudyLeaderboardEntry,
        "todayMinutes" | "weekMinutes" | "monthMinutes" | "semesterMinutes" | "totalMinutes"
    >
): StudioStudyLeaderboardEntry[] {
    return Array.from(entries)
        .filter((entry) => entry[metric] > 0)
        .sort((a, b) => {
            const metricDiff = b[metric] - a[metric]
            if (metricDiff !== 0) return metricDiff

            if (a.isActive !== b.isActive) {
                return Number(b.isActive) - Number(a.isActive)
            }

            const totalDiff = b.totalMinutes - a.totalMinutes
            if (totalDiff !== 0) return totalDiff

            return a.name.localeCompare(b.name, "zh-CN")
        })
}

export function buildStudioStudyLeaderboard(
    sessions: ReadonlyArray<StudioSessionLike>,
    nowInput: Date | string | number = new Date(),
    timeZone = DUTY_TIME_ZONE
): StudioStudyLeaderboard {
    const nowMs = toZonedEpochMs(nowInput, timeZone)
    const nowParts = toZonedDateTimeParts(nowInput, timeZone)
    const todayStartMs = dateKeyToZonedEpochMs(nowParts.dateKey)
    const weekStartMs = dateKeyToZonedEpochMs(getDutyWeekMondayDateKey(nowInput, timeZone))
    const monthStartMs = dateKeyToZonedEpochMs(getMonthStartDateKey(nowInput, timeZone))
    const semesterStartMs = dateKeyToZonedEpochMs(getSemesterStartDateKey(nowInput, timeZone))

    const memberMap = new Map<string, StudioStudyLeaderboardEntry>()
    const activeMemberIds = new Set<string>()

    sessions.forEach((session) => {
        try {
            const startMs = toZonedEpochMs(session.started_at, timeZone)
            const endMs = session.ended_at ? toZonedEpochMs(session.ended_at, timeZone) : nowMs

            if (endMs <= startMs) return

            const existing = memberMap.get(session.member_id)
            const entry =
                existing ||
                ({
                    memberId: session.member_id,
                    name: session.member?.name?.trim() || "成员",
                    todayMinutes: 0,
                    weekMinutes: 0,
                    monthMinutes: 0,
                    semesterMinutes: 0,
                    totalMinutes: 0,
                    isActive: false,
                } satisfies StudioStudyLeaderboardEntry)

            entry.todayMinutes += toWholeMinutes(getOverlapMs(startMs, endMs, todayStartMs, nowMs))
            entry.weekMinutes += toWholeMinutes(getOverlapMs(startMs, endMs, weekStartMs, nowMs))
            entry.monthMinutes += toWholeMinutes(getOverlapMs(startMs, endMs, monthStartMs, nowMs))
            entry.semesterMinutes += toWholeMinutes(getOverlapMs(startMs, endMs, semesterStartMs, nowMs))
            entry.totalMinutes += toWholeMinutes(endMs - startMs)
            entry.isActive = entry.isActive || !!session.is_active

            if (!existing) {
                memberMap.set(session.member_id, entry)
            }
        } catch {
            return
        }

        if (session.is_active) {
            activeMemberIds.add(session.member_id)
        }
    })

    return {
        activeCount: activeMemberIds.size,
        today: sortLeaderboardEntries(memberMap.values(), "todayMinutes"),
        week: sortLeaderboardEntries(memberMap.values(), "weekMinutes"),
        month: sortLeaderboardEntries(memberMap.values(), "monthMinutes"),
        semester: sortLeaderboardEntries(memberMap.values(), "semesterMinutes"),
        total: sortLeaderboardEntries(memberMap.values(), "totalMinutes"),
    }
}


