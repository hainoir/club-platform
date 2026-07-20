import assert from 'node:assert/strict'
import test from 'node:test'

import {
    addDaysToDateKey,
    getNextDutyLeaveDateKey,
    getDutyPeriodByMinutes,
    getDutyWeekMondayDateKey,
    isCurrentDutyLeave,
    isDutyLeaveDateSelectable,
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

test('next leave date stays on the current slot before it ends and moves one week after it ends', () => {
    assert.equal(
        getNextDutyLeaveDateKey(1, 1, '2026-03-23T00:30:00.000Z'),
        '2026-03-23',
    )
    assert.equal(
        getNextDutyLeaveDateKey(1, 1, '2026-03-23T01:36:00.000Z'),
        '2026-03-30',
    )
})

test('leave date selection rejects another weekday, past dates, and an ended current slot', () => {
    const beforeEnd = '2026-03-23T01:34:00.000Z'
    const afterEnd = '2026-03-23T01:36:00.000Z'

    assert.equal(isDutyLeaveDateSelectable('2026-03-23', 1, 1, beforeEnd), true)
    assert.equal(isDutyLeaveDateSelectable('2026-03-24', 1, 1, beforeEnd), false)
    assert.equal(isDutyLeaveDateSelectable('2026-03-16', 1, 1, beforeEnd), false)
    assert.equal(isDutyLeaveDateSelectable('2026-03-23', 1, 1, afterEnd), false)
})

test('current leave is hidden at its end time and never reappears the next week', () => {
    const leave = {
        day_of_week: 1,
        period: 1,
        leave_date: '2026-03-23',
        expires_at: '2026-03-23T01:35:00.000Z',
    }

    assert.equal(isCurrentDutyLeave(leave, '2026-03-23T01:34:59.000Z'), true)
    assert.equal(isCurrentDutyLeave(leave, '2026-03-23T01:35:00.000Z'), false)
    assert.equal(isCurrentDutyLeave(leave, '2026-03-30T00:30:00.000Z'), false)
})

test('leave time rules reject invalid slots and non-integer weekdays', () => {
    assert.throws(
        () => getNextDutyLeaveDateKey(1.5, 1, '2026-03-23T00:30:00.000Z'),
        /Invalid duty leave slot/,
    )
    assert.throws(
        () => getNextDutyLeaveDateKey(1, 5, '2026-03-23T00:30:00.000Z'),
        /Invalid duty leave slot/,
    )
    assert.equal(isDutyLeaveDateSelectable('2026-03-23', 1.5, 1, '2026-03-23T00:30:00.000Z'), false)
    assert.equal(isDutyLeaveDateSelectable('2026-03-23', 1, 5, '2026-03-23T00:30:00.000Z'), false)
})

test('leave date selection rejects nonexistent calendar dates', () => {
    assert.equal(isDutyLeaveDateSelectable('2026-02-30', 1, 1, '2026-02-01T00:30:00Z'), false)
})

test('current leave rejects a nonexistent UTC expiration timestamp', () => {
    assert.equal(
        isCurrentDutyLeave(
            {
                day_of_week: 1,
                period: 1,
                leave_date: '2026-03-02',
                expires_at: '2026-02-30T01:35:00.000Z',
            },
            '2026-03-02T00:30:00Z',
        ),
        false,
    )
})



