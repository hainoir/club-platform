import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useApprovePendingLeave } from '@/hooks/duty/useApprovePendingLeave'
import { useRejectSwap } from '@/hooks/duty/useRejectSwap'
import { useRespondToSwap } from '@/hooks/duty/useRespondToSwap'
import { useSubmitLeave } from '@/hooks/duty/useSubmitLeave'
import { useVolunteerForSwap } from '@/hooks/duty/useVolunteerForSwap'
import type { AppUser } from '@/lib/app-user'
import { addDaysToDateKey, getDayOfWeekFromDateKey, getDutyNow } from '@/lib/duty/duty-time'
import { isChinaPublicHoliday } from '@/lib/duty/china-public-holidays'
import type { SwapWithMember } from '@/hooks/duty/types'

import { createDutySupabase, type DutyCall } from './duty-supabase'

const member: AppUser = {
    id: 'member-1',
    email: 'member@example.com',
    role: '干事',
    name: '甲',
}

const admin: AppUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'admin',
    name: '管',
}

function nextLeaveSlot() {
    const today = getDutyNow().dateKey
    for (let offset = 1; offset <= 21; offset += 1) {
        const leaveDate = addDaysToDateKey(today, offset)
        const day = getDayOfWeekFromDateKey(leaveDate)
        if (day >= 1 && day <= 5 && !isChinaPublicHoliday(leaveDate)) {
            return { leaveDate, day, period: 1 }
        }
    }
    throw new Error('No selectable duty date in the next three weeks')
}

function swap(overrides: Partial<SwapWithMember> = {}): SwapWithMember {
    return {
        id: 'swap-1',
        requester_id: 'member-1',
        target_id: 'member-2',
        leave_id: 'leave-1',
        original_day: 1,
        original_period: 2,
        target_day: null,
        target_period: null,
        status: 'accepted',
        created_at: '2026-10-15T00:00:00Z',
        requester: { id: 'member-1', name: '甲' },
        target: { id: 'member-2', name: '乙' },
        ...overrides,
    }
}

function inserts(calls: DutyCall[]) {
    return calls.filter((call) => call.method === 'insert')
}

describe('leave and swap transitions', () => {
    it('rejects a leave date that does not match the duty weekday', async () => {
        const supabase = createDutySupabase()
        const toast = vi.fn()
        const { result } = renderHook(() => useSubmitLeave({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
            refreshPendingLeaves: vi.fn(),
            refreshSwaps: vi.fn(),
        }))

        let submitted = true
        await act(async () => {
            submitted = await result.current(2, 1, '2026-10-19', '有事', 0, [], false)
        })

        expect(submitted).toBe(false)
        expect(inserts(supabase.calls)).toEqual([])
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            title: '请假日期无效',
            variant: 'destructive',
        }))
    })

    it('submits a pending leave, compensations, and a targeted swap', async () => {
        const slot = nextLeaveSlot()
        const supabase = createDutySupabase()
        const refreshPendingLeaves = vi.fn()
        const refreshSwaps = vi.fn()
        const { result } = renderHook(() => useSubmitLeave({
            supabase: supabase.client,
            user: member,
            toast: vi.fn(),
            ensureActiveSession: async () => true,
            refreshPendingLeaves,
            refreshSwaps,
        }))

        let submitted = false
        await act(async () => {
            submitted = await result.current(
                slot.day,
                slot.period,
                slot.leaveDate,
                '出差',
                1,
                [{ compensation_date: slot.leaveDate, day_of_week: slot.day, period: 2 }],
                true,
                'member-2'
            )
        })

        expect(submitted).toBe(true)
        expect(inserts(supabase.calls).map((call) => call.table)).toEqual([
            'duty_leaves',
            'duty_compensations',
            'duty_swaps',
        ])
        expect(inserts(supabase.calls)[0]?.payload).toMatchObject({
            member_id: 'member-1',
            day_of_week: slot.day,
            period: slot.period,
            leave_date: slot.leaveDate,
            status: 'pending',
            penalty_shifts: 1,
        })
        expect(inserts(supabase.calls)[2]?.payload).toMatchObject({
            requester_id: 'member-1',
            leave_id: 'leave-1',
            original_day: slot.day,
            original_period: slot.period,
            target_id: 'member-2',
        })
        expect(refreshPendingLeaves).toHaveBeenCalled()
        expect(refreshSwaps).toHaveBeenCalled()
    })

    it('rolls the pending leave back when a later write fails', async () => {
        const slot = nextLeaveSlot()
        const supabase = createDutySupabase({
            results: {
                duty_compensations: { data: null, error: { message: 'comp failed' } },
            },
        })
        const refreshPendingLeaves = vi.fn()
        const toast = vi.fn()
        const { result } = renderHook(() => useSubmitLeave({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
            refreshPendingLeaves,
            refreshSwaps: vi.fn(),
        }))

        let submitted = true
        await act(async () => {
            submitted = await result.current(slot.day, slot.period, slot.leaveDate, '', 0, [
                { compensation_date: slot.leaveDate, day_of_week: slot.day, period: 3 },
            ], false)
        })

        expect(submitted).toBe(false)
        expect(supabase.calls.some((call) => call.table === 'duty_leaves' && call.method === 'delete')).toBe(true)
        expect(supabase.calls).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'duty_leaves', method: 'eq', column: 'id', value: 'leave-1' }),
            expect.objectContaining({ table: 'duty_leaves', method: 'eq', column: 'status', value: 'pending' }),
        ]))
        expect(refreshPendingLeaves).not.toHaveBeenCalled()
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '请假失败', variant: 'destructive' }))
    })

    it('lets an admin approve an accepted swap and blocks a member from doing so', async () => {
        const record = swap()
        const supabase = createDutySupabase({
            rpc: async () => ({ data: null, error: null }),
        })
        const refreshRosters = vi.fn()
        const adminHook = renderHook(() => useRespondToSwap({
            supabase: supabase.client,
            user: admin,
            toast: vi.fn(),
            ensureActiveSession: async () => true,
            swaps: [record],
            refreshSwaps: vi.fn(),
            refreshApprovedSwaps: vi.fn(),
            refreshRosters,
            refreshApprovedLeaves: vi.fn(),
            refreshPendingLeaves: vi.fn(),
            setIsSwapping: vi.fn(),
        }))

        await act(async () => {
            await adminHook.result.current(record.id, true)
        })

        expect(supabase.rpc).toHaveBeenCalledWith('accept_duty_swap', {
            p_swap_id: 'swap-1',
            p_acceptor_id: 'member-2',
        })
        expect(refreshRosters).toHaveBeenCalled()

        const memberSupabase = createDutySupabase()
        const toast = vi.fn()
        const memberHook = renderHook(() => useRespondToSwap({
            supabase: memberSupabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
            swaps: [record],
            refreshSwaps: vi.fn(),
            refreshApprovedSwaps: vi.fn(),
            refreshRosters: vi.fn(),
            refreshApprovedLeaves: vi.fn(),
            refreshPendingLeaves: vi.fn(),
            setIsSwapping: vi.fn(),
        }))

        await act(async () => {
            await memberHook.result.current(record.id, true)
        })

        expect(memberSupabase.rpc).not.toHaveBeenCalled()
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            title: '权限不足',
            variant: 'destructive',
        }))
    })

    it('withdraws a linked leave and deletes a standalone swap request', async () => {
        const linked = createDutySupabase()
        const linkedHook = renderHook(() => useRespondToSwap({
            supabase: linked.client,
            user: member,
            toast: vi.fn(),
            ensureActiveSession: async () => true,
            swaps: [swap()],
            refreshSwaps: vi.fn(),
            refreshApprovedSwaps: vi.fn(),
            refreshRosters: vi.fn(),
            refreshApprovedLeaves: vi.fn(),
            refreshPendingLeaves: vi.fn(),
            setIsSwapping: vi.fn(),
        }))

        await act(async () => {
            await linkedHook.result.current('swap-1', false)
        })

        expect(linked.calls.some((call) => call.table === 'duty_leaves' && call.method === 'delete')).toBe(true)
        expect(linked.calls.some((call) => call.table === 'duty_swaps' && call.method === 'delete')).toBe(false)

        const standalone = createDutySupabase()
        const standaloneHook = renderHook(() => useRespondToSwap({
            supabase: standalone.client,
            user: member,
            toast: vi.fn(),
            ensureActiveSession: async () => true,
            swaps: [swap({ leave_id: null })],
            refreshSwaps: vi.fn(),
            refreshApprovedSwaps: vi.fn(),
            refreshRosters: vi.fn(),
            refreshApprovedLeaves: vi.fn(),
            refreshPendingLeaves: vi.fn(),
            setIsSwapping: vi.fn(),
        }))

        await act(async () => {
            await standaloneHook.result.current('swap-1', false)
        })

        expect(standalone.calls.some((call) => call.table === 'duty_swaps' && call.method === 'delete')).toBe(true)
    })

    it('volunteers, returns a swap to the hall, and approves a direct leave', async () => {
        const volunteer = createDutySupabase({
            rpc: async () => ({ data: null, error: null }),
        })
        const volunteerHook = renderHook(() => useVolunteerForSwap({
            supabase: volunteer.client,
            user: member,
            toast: vi.fn(),
            ensureActiveSession: async () => true,
            swaps: [swap({ target_id: null, status: 'pending', target: null })],
            refreshSwaps: vi.fn(),
            setIsSwapping: vi.fn(),
        }))
        await act(async () => {
            await volunteerHook.result.current('swap-1')
        })
        expect(volunteer.rpc).toHaveBeenCalledWith('volunteer_for_duty_swap', { p_swap_id: 'swap-1' })

        const returned = createDutySupabase({
            rpc: async () => ({ data: null, error: null }),
        })
        const returnToast = vi.fn()
        const returnHook = renderHook(() => useRejectSwap({
            supabase: returned.client,
            user: member,
            toast: returnToast,
            ensureActiveSession: async () => true,
            refreshSwaps: vi.fn(),
            setIsSwapping: vi.fn(),
        }))
        await act(async () => {
            await returnHook.result.current('swap-1')
        })
        expect(returned.rpc).toHaveBeenCalledWith('return_duty_swap_to_hall', { p_swap_id: 'swap-1' })
        expect(returnToast).toHaveBeenCalledWith(expect.objectContaining({ title: '已退回大厅' }))

        const approval = createDutySupabase({
            rpc: async () => ({ data: null, error: null }),
        })
        const approvalToast = vi.fn()
        const refreshApprovedLeaves = vi.fn()
        const refreshPendingLeaves = vi.fn()
        const approvalHook = renderHook(() => useApprovePendingLeave({
            supabase: approval.client,
            user: admin,
            toast: approvalToast,
            ensureActiveSession: async () => true,
            refreshApprovedLeaves,
            refreshPendingLeaves,
        }))
        await act(async () => {
            await approvalHook.result.current('leave-1')
        })
        expect(approval.rpc).toHaveBeenCalledWith('approve_duty_leave', { p_leave_id: 'leave-1' })
        expect(approvalToast).toHaveBeenCalledWith(expect.objectContaining({ title: '已批准请假' }))
        expect(refreshApprovedLeaves).toHaveBeenCalled()
        expect(refreshPendingLeaves).toHaveBeenCalled()
    })
})
