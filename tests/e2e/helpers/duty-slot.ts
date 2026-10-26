import { isDutyRequiredDate } from '../../../lib/duty/china-public-holidays.ts'

/** Standing seed slot for e2e.member@club.local. See supabase/seed.sql. */
export const E2E_DUTY_SLOT = {
    period: 2,
    label: '第二节',
    start: '10:05',
    end: '11:40',
    pinTime: '10:30:00',
} as const

const SHANGHAI_OFFSET = '+08:00'
const JWT_EXPIRY_MS = 3_600_000
const SESSION_MIN_VALIDITY_MS = 60_000
const PIN_SLACK_MS = 10 * 60_000

export type DutySlotPin =
    | { ok: true; dateKey: string; targetMs: number; iso: string }
    | { ok: false; reason: string }

export function shanghaiDateKey(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now)
}

/**
 * Browser clock for the seeded 第二节 slot on today's Shanghai date.
 * A pin later than the access token's remaining life makes ensureClientSession
 * treat a fresh login as expired, so early-morning runs skip instead.
 */
export function resolveE2EDutySlotPin(now: Date = new Date()): DutySlotPin {
    const dateKey = shanghaiDateKey(now)
    const iso = `${dateKey}T${E2E_DUTY_SLOT.pinTime}${SHANGHAI_OFFSET}`

    if (!isDutyRequiredDate(dateKey)) {
        return {
            ok: false,
            reason: `${dateKey} is a weekend or public holiday. The seeded ${E2E_DUTY_SLOT.label} roster is not today's shift.`,
        }
    }

    const targetMs = Date.parse(iso)
    const latestSafeMs = now.getTime() + JWT_EXPIRY_MS - SESSION_MIN_VALIDITY_MS - PIN_SLACK_MS
    if (targetMs > latestSafeMs) {
        return {
            ok: false,
            reason: `Pinning the browser to ${iso} would outrun the 1h session. Duty sign-in specs run after 09:41 Asia/Shanghai.`,
        }
    }

    return { ok: true, dateKey, targetMs, iso }
}
