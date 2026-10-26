export const EVENT_TIME_ZONE = 'Asia/Shanghai'

const EVENT_TIME_OFFSET_MS = 8 * 60 * 60 * 1000

function parseParts(value: string, label: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    if (!match) throw new Error(`${label}格式无效。`)

    const [, year, month, day, hour, minute] = match.map(Number)
    const wallClock = new Date(Date.UTC(year, month - 1, day, hour, minute))
    if (
        wallClock.getUTCFullYear() !== year
        || wallClock.getUTCMonth() !== month - 1
        || wallClock.getUTCDate() !== day
        || wallClock.getUTCHours() !== hour
        || wallClock.getUTCMinutes() !== minute
    ) {
        throw new Error(`${label}日期或时间无效。`)
    }
    return new Date(wallClock.getTime() - EVENT_TIME_OFFSET_MS)
}
export function getEventCalendarDateKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function eventDateTimeToISOString(dateKey: string, time: string, label = '活动时间'): string {
    return parseParts(`${dateKey}T${time}`, label).toISOString()
}

export function formatEventDateTime(value: string, options: Intl.DateTimeFormatOptions): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: EVENT_TIME_ZONE }).format(date)
}

export function eventTimestampToCalendarDate(value: string): Date | undefined {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return undefined
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: EVENT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return new Date(Number(values.year), Number(values.month) - 1, Number(values.day))
}
