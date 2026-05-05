import assert from 'node:assert/strict'

import {
    addDaysToDateKey,
    getNextDutySlotDateKey,
    getDutyPeriodByMinutes,
    getDutyWeekMondayDateKey,
    listCompensationSlotsForDuty,
    resolveDutySignInSlot,
    toDutyDateTimeParts,
} from '../../lib/duty/duty-time.ts'
import { isDutyRequiredDate } from '../../lib/duty/china-public-holidays.ts'

const FIXED_SIGN_IN_UTC = '2026-03-24T07:38:00.000Z'

function withTimeZone(tz, fn) {
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

const parts = toDutyDateTimeParts(FIXED_SIGN_IN_UTC)
assert.equal(parts.dayOfWeek, 2)
assert.equal(parts.dateKey, '2026-03-24')
assert.equal(parts.hour, 15)
assert.equal(parts.minute, 38)
assert.equal(getDutyPeriodByMinutes(parts.minutes), 4)

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

assert.equal(getDutyWeekMondayDateKey('2026-03-29T10:00:00.000Z'), '2026-03-23')
assert.equal(addDaysToDateKey('2026-03-23', 1), '2026-03-24')

const compensationSlots = listCompensationSlotsForDuty(2, 2, '2026-03-23T01:00:00.000Z')
assert.equal(compensationSlots.length, 34)
assert.deepEqual(compensationSlots[0], {
    dateKey: '2026-03-24',
    dayOfWeek: 2,
    period: 3,
    weekOffset: 0,
})
assert.deepEqual(compensationSlots[13], {
    dateKey: '2026-03-27',
    dayOfWeek: 5,
    period: 4,
    weekOffset: 0,
})
assert.deepEqual(compensationSlots[14], {
    dateKey: '2026-03-30',
    dayOfWeek: 1,
    period: 1,
    weekOffset: 1,
})
assert.deepEqual(compensationSlots.at(-1), {
    dateKey: '2026-04-03',
    dayOfWeek: 5,
    period: 4,
    weekOffset: 1,
})

assert.equal(isDutyRequiredDate('2026-05-01'), false)
assert.equal(isDutyRequiredDate('2026-10-01'), false)
assert.equal(isDutyRequiredDate('2026-05-09'), false)
assert.equal(isDutyRequiredDate('2026-05-08'), true)

assert.equal(getNextDutySlotDateKey(5, 1, '2026-04-30T01:00:00.000Z'), '2026-05-08')
assert.equal(getNextDutySlotDateKey(4, 1, '2026-09-30T01:00:00.000Z'), '2026-10-08')

const holidayAwareCompensationSlots = listCompensationSlotsForDuty(4, 4, '2026-04-30T01:00:00.000Z')
const holidayAwareCompensationDateKeys = new Set(holidayAwareCompensationSlots.map((slot) => slot.dateKey))
assert.equal(holidayAwareCompensationDateKeys.has('2026-05-01'), false)
assert.equal(holidayAwareCompensationDateKeys.has('2026-05-04'), false)
assert.equal(holidayAwareCompensationDateKeys.has('2026-05-05'), false)
assert.equal(holidayAwareCompensationSlots.length, 12)
assert.deepEqual(holidayAwareCompensationSlots[0], {
    dateKey: '2026-05-06',
    dayOfWeek: 3,
    period: 1,
    weekOffset: 1,
})

console.log('duty-time assertions passed')
