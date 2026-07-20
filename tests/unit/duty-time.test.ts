import assert from 'node:assert/strict'
import test from 'node:test'

import {
    addDaysToDateKey,
    getNextDutyLeaveDateKey,
    getNextDutySlotDateKey,
    getDutyPeriodByMinutes,
    getDutyWeekMondayDateKey,
    isCurrentDutyLeave,
    isDutyLeaveDateSelectable,
    listCompensationSlotsForDuty,
    resolveDutySignInSlot,
    toDutyDateTimeParts,
} from '../../lib/duty/duty-time.ts'
import { isDutyRequiredDate } from '../../lib/duty/china-public-holidays.ts'

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

test('next leave date stays on the current slot before it ends and moves after it ends', () => {
    assert.equal(getNextDutyLeaveDateKey(1, 1, '2026-03-23T00:30:00.000Z'), '2026-03-23')
    assert.equal(getNextDutyLeaveDateKey(1, 1, '2026-03-23T01:35:00.000Z'), '2026-03-30')
})

test('next leave date skips public holidays', () => {
    assert.equal(getNextDutyLeaveDateKey(5, 1, '2026-04-30T01:00:00.000Z'), '2026-05-08')
})

test('leave date selection rejects another weekday, holidays, past dates, and ended slots', () => {
    const beforeEnd = '2026-03-23T01:34:00.000Z'
    const afterEnd = '2026-03-23T01:35:00.000Z'

    assert.equal(isDutyLeaveDateSelectable('2026-03-23', 1, 1, beforeEnd), true)
    assert.equal(isDutyLeaveDateSelectable('2026-03-24', 1, 1, beforeEnd), false)
    assert.equal(isDutyLeaveDateSelectable('2026-03-16', 1, 1, beforeEnd), false)
    assert.equal(isDutyLeaveDateSelectable('2026-03-23', 1, 1, afterEnd), false)
    assert.equal(isDutyLeaveDateSelectable('2026-05-01', 5, 1, '2026-04-30T01:00:00.000Z'), false)
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

test('future-week leave is stored but does not affect the current displayed week', () => {
    assert.equal(isCurrentDutyLeave({
        day_of_week: 1,
        period: 1,
        leave_date: '2026-03-30',
        expires_at: '2026-03-30T01:35:00.000Z',
    }, '2026-03-23T00:30:00.000Z'), false)
})

test('leave rules reject invalid dates, slots, and expiration timestamps', () => {
    assert.throws(
        () => getNextDutyLeaveDateKey(1.5, 1, '2026-03-23T00:30:00.000Z'),
        /Invalid duty leave slot/,
    )
    assert.equal(isDutyLeaveDateSelectable('2026-02-30', 1, 1, '2026-02-01T00:30:00Z'), false)
    assert.equal(isDutyLeaveDateSelectable('2026-03-23', 1, 5, '2026-03-23T00:30:00Z'), false)
    assert.equal(isCurrentDutyLeave({
        day_of_week: 1,
        period: 1,
        leave_date: '2026-03-02',
        expires_at: '2026-02-30T01:35:00.000Z',
    }, '2026-03-02T00:30:00Z'), false)
})

test('UTC PostgREST expiration formats are accepted consistently across runtime timezones', () => {
    const now = '2026-03-23T00:30:00.000Z'
    const leave = {
        day_of_week: 1,
        period: 1,
        leave_date: '2026-03-23',
        expires_at: '2026-03-23T01:35:00.000000+00:00',
    }

    const run = () => isCurrentDutyLeave(leave, now)
    assert.equal(withTimeZone('UTC', run), true)
    assert.equal(withTimeZone('America/Los_Angeles', run), true)
    assert.equal(isCurrentDutyLeave({
        ...leave,
        expires_at: '2026-03-23T09:35:00+08:00',
    }, now), false)
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

test('public holidays are skipped while makeup weekends stay non-duty days', () => {
    assert.equal(isDutyRequiredDate('2026-05-01'), false)
    assert.equal(isDutyRequiredDate('2026-10-01'), false)
    assert.equal(isDutyRequiredDate('2026-05-09'), false)
    assert.equal(isDutyRequiredDate('2026-05-08'), true)
})

test('next duty slot skips public holidays', () => {
    assert.equal(getNextDutySlotDateKey(5, 1, '2026-04-30T01:00:00.000Z'), '2026-05-08')
    assert.equal(getNextDutySlotDateKey(4, 1, '2026-09-30T01:00:00.000Z'), '2026-10-08')
})

test('compensation slots never include public holidays', () => {
    const slots = listCompensationSlotsForDuty(4, 4, '2026-04-30T01:00:00.000Z')
    const dateKeys = new Set(slots.map((slot) => slot.dateKey))

    assert.equal(dateKeys.has('2026-05-01'), false)
    assert.equal(dateKeys.has('2026-05-04'), false)
    assert.equal(dateKeys.has('2026-05-05'), false)
    assert.equal(slots.length, 12)
    assert.deepEqual(slots[0], {
        dateKey: '2026-05-06',
        dayOfWeek: 3,
        period: 1,
        weekOffset: 1,
    })
})



