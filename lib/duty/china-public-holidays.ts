const CHINA_PUBLIC_HOLIDAY_DATE_KEYS = new Set([
    // 2026 official public holiday dates from https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm.
    // Makeup working days are intentionally omitted.
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-02-15",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-02-21",
    "2026-02-22",
    "2026-02-23",
    "2026-04-04",
    "2026-04-05",
    "2026-04-06",
    "2026-05-01",
    "2026-05-02",
    "2026-05-03",
    "2026-05-04",
    "2026-05-05",
    "2026-06-19",
    "2026-06-20",
    "2026-06-21",
    "2026-09-25",
    "2026-09-26",
    "2026-09-27",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
])

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

function getDayOfWeekFromDateKey(dateKey: string): number {
    const { year, month, day } = parseDateKey(dateKey)
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function isChinaPublicHoliday(dateKey: string): boolean {
    return CHINA_PUBLIC_HOLIDAY_DATE_KEYS.has(dateKey)
}

export function isDutyRequiredDate(dateKey: string): boolean {
    const dayOfWeek = getDayOfWeekFromDateKey(dateKey)
    return dayOfWeek >= 1 && dayOfWeek <= 5 && !isChinaPublicHoliday(dateKey)
}
