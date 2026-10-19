import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveE2EDutySlotPin } from '../e2e/helpers/duty-slot.ts'

test('pins Friday afternoon to 10:30 Asia/Shanghai on that date', () => {
    const pin = resolveE2EDutySlotPin(new Date('2026-10-16T09:30:00Z'))
    assert.equal(pin.ok, true)
    if (!pin.ok) return
    assert.equal(pin.dateKey, '2026-10-16')
    assert.equal(pin.iso, '2026-10-16T10:30:00+08:00')
})

test('skips a pin that would expire the one-hour session', () => {
    const pin = resolveE2EDutySlotPin(new Date('2026-10-16T00:00:00Z'))
    assert.equal(pin.ok, false)
    if (pin.ok) return
    assert.match(pin.reason, /09:41/)
})

test('skips weekends and the National Day holiday', () => {
    const weekend = resolveE2EDutySlotPin(new Date('2026-10-17T02:30:00Z'))
    assert.equal(weekend.ok, false)
    const holiday = resolveE2EDutySlotPin(new Date('2026-10-01T02:30:00Z'))
    assert.equal(holiday.ok, false)
})
