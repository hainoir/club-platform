import assert from 'node:assert/strict'
import test from 'node:test'

import {
    addDaysToDateKey,
    getDutyPeriodByMinutes,
    getDutyWeekMondayDateKey,
    listCompensationSlotsForDuty,
    resolveDutySignInSlot,
    toDutyDateTimeParts,
} from '../../lib/duty-time.ts'

const FIXED_SIGN_IN_UTC = '2026-03-24T07:38:00.000Z'

function withTimeZone<T>(tz: string, fn: () => T): T {
    const previous = process.env.TZ
    process.env.TZ = tz
    try {
        return fn()
    } finally {
        if (previous === undefined) {
            delete process.env.TZ
        } else {
            process.env.TZ = previous
        }
    }
}

test('fixed UTC sign-in maps to duty Tuesday period 4', () => {
    const parts = toDutyDateTimeParts(FIXED_SIGN_IN_UTC)
    assert.equal(parts.dayOfWeek, 2)
    assert.equal(parts.dateKey, '2026-03-24')
    assert.equal(parts.hour, 15)
    assert.equal(parts.minute, 38)
    assert.equal(getDutyPeriodByMinutes(parts.minutes), 4)
})

test('slot resolution stays stable when runtime TZ changes', () => {
    const run = () => ({
        runtimeHour: new Date(FIXED_SIGN_IN_UTC).getHours(),
        slot: resolveDutySignInSlot({
            member_id: 'member-1',
            sign_in_time: FIXED_SIGN_IN_UTC,
            sign_in_date: '2026-03-24',
        }),
    })

    const fromUtcRuntime = withTimeZone('UTC', run)
    const fromShanghaiRuntime = withTimeZone('Asia/Shanghai', run)

    assert.equal(fromUtcRuntime.runtimeHour, 7)
    assert.equal(fromShanghaiRuntime.runtimeHour, 15)
    assert.equal(fromUtcRuntime.slot?.slotKey, 'member-1-2026-03-24-4')
    assert.equal(fromShanghaiRuntime.slot?.slotKey, 'member-1-2026-03-24-4')
    assert.equal(fromUtcRuntime.slot?.signedAtLabel, '15:38')
    assert.equal(fromShanghaiRuntime.slot?.signedAtLabel, '15:38')
})

test('week monday date key is computed in duty timezone', () => {
    assert.equal(getDutyWeekMondayDateKey('2026-03-29T10:00:00.000Z'), '2026-03-23')
    assert.equal(addDaysToDateKey('2026-03-23', 1), '2026-03-24')
})

test('compensation slots include the rest of the leave week and all of next week', () => {
    const slots = listCompensationSlotsForDuty(2, 2, '2026-03-23T01:00:00.000Z')

    assert.equal(slots.length, 34)
    assert.deepEqual(slots[0], {
        dateKey: '2026-03-24',
        dayOfWeek: 2,
        period: 3,
        weekOffset: 0,
    })
    assert.deepEqual(slots[13], {
        dateKey: '2026-03-27',
        dayOfWeek: 5,
        period: 4,
        weekOffset: 0,
    })
    assert.deepEqual(slots[14], {
        dateKey: '2026-03-30',
        dayOfWeek: 1,
        period: 1,
        weekOffset: 1,
    })
    assert.deepEqual(slots.at(-1), {
        dateKey: '2026-04-03',
        dayOfWeek: 5,
        period: 4,
        weekOffset: 1,
    })
})



