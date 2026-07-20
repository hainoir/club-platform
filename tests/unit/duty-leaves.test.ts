import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildApprovedLeaveSlotSet,
    filterPendingLeavesWithoutSwap,
    filterRostersForDutyAvailability,
    getDutyLeaveSlotKey,
} from '../../lib/duty/duty-leaves.ts'

test('approved leave slots are keyed by member, day, and period', () => {
    assert.equal(getDutyLeaveSlotKey('member-1', 2, 3), 'member-1-2-3')

    const slotSet = buildApprovedLeaveSlotSet([
        { member_id: 'member-1', day_of_week: 2, period: 3, status: 'approved', leave_date: '2026-03-24', expires_at: '2026-03-24T07:05:00Z' },
        { member_id: 'member-2', day_of_week: 4, period: 1, status: 'pending' },
        { member_id: 'member-3', day_of_week: 5, period: 2 },
    ], '2026-03-24T06:00:00Z')

    assert.equal(slotSet.has('member-1-2-3'), true)
    assert.equal(slotSet.has('member-2-4-1'), false)
    assert.equal(slotSet.has('member-3-5-2'), false)
})

test('active rosters exclude only approved leave slots', () => {
    const rosters = [
        { member_id: 'member-1', day_of_week: 1, period: 1, name: 'slot-1' },
        { member_id: 'member-2', day_of_week: 1, period: 2, name: 'slot-2' },
        { member_id: 'member-3', day_of_week: 2, period: 1, name: 'slot-3' },
    ]

    const filtered = filterRostersForDutyAvailability(rosters, [
        { member_id: 'member-1', day_of_week: 1, period: 1, status: 'approved', leave_date: '2026-03-23', expires_at: '2026-03-23T01:35:00Z' },
        { member_id: 'member-2', day_of_week: 1, period: 2, status: 'pending' },
    ], '2026-03-23T00:30:00Z')

    assert.deepEqual(filtered, [
        { member_id: 'member-2', day_of_week: 1, period: 2, name: 'slot-2' },
        { member_id: 'member-3', day_of_week: 2, period: 1, name: 'slot-3' },
    ])
})

test('expired and future-week leaves do not remove recurring rosters', () => {
    const rosters = [
        { member_id: 'member-1', day_of_week: 1, period: 1 },
        { member_id: 'member-2', day_of_week: 1, period: 1 },
    ]

    const filtered = filterRostersForDutyAvailability(rosters, [
        { member_id: 'member-1', day_of_week: 1, period: 1, status: 'approved', leave_date: '2026-03-16', expires_at: '2026-03-16T01:35:00Z' },
        { member_id: 'member-2', day_of_week: 1, period: 1, status: 'approved', leave_date: '2026-03-30', expires_at: '2026-03-30T01:35:00Z' },
    ], '2026-03-23T00:30:00Z')

    assert.deepEqual(filtered, rosters)
})

test('pending direct leaves exclude swap-linked leave ids', () => {
    const pendingLeaves = [
        { id: 'leave-1', member_id: 'member-1', day_of_week: 1, period: 1, status: 'pending' },
        { id: 'leave-2', member_id: 'member-2', day_of_week: 2, period: 2, status: 'pending' },
        { id: 'leave-3', member_id: 'member-3', day_of_week: 3, period: 3, status: 'pending' },
    ]

    const filtered = filterPendingLeavesWithoutSwap(pendingLeaves, [
        { leave_id: 'leave-2' },
        { leave_id: null },
    ])

    assert.deepEqual(filtered, [
        { id: 'leave-1', member_id: 'member-1', day_of_week: 1, period: 1, status: 'pending' },
        { id: 'leave-3', member_id: 'member-3', day_of_week: 3, period: 3, status: 'pending' },
    ])
})
