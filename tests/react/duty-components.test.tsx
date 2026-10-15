import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LeaveAdminReview } from '@/components/duty/leave/LeaveAdminReview'
import { SignInCard } from '@/components/duty/attendance/SignInCard'
import type { LeaveWithMember, SwapWithMember } from '@/hooks/duty/types'

function leave(overrides: Partial<LeaveWithMember> = {}): LeaveWithMember {
    return {
        id: 'leave-1',
        member_id: 'member-1',
        day_of_week: 1,
        period: 1,
        leave_date: '2026-10-19',
        expires_at: '2026-10-19T01:35:00Z',
        reason: '出差',
        penalty_shifts: 0,
        status: 'pending',
        created_at: '2026-10-15T00:00:00Z',
        member: { id: 'member-1', name: '甲' },
        ...overrides,
    }
}

function swap(overrides: Partial<SwapWithMember> = {}): SwapWithMember {
    return {
        id: 'swap-1',
        requester_id: 'member-1',
        target_id: null,
        leave_id: 'leave-2',
        original_day: 2,
        original_period: 1,
        target_day: null,
        target_period: null,
        status: 'pending',
        created_at: '2026-10-15T00:00:00Z',
        requester: { id: 'member-1', name: '甲' },
        target: null,
        ...overrides,
    }
}

describe('SignInCard', () => {
    it('disables check-in outside an assigned period and explains why', () => {
        const onSignIn = vi.fn()
        const { rerender } = render(
            <SignInCard onSignIn={onSignIn} isSigningIn={false} isInDutyPeriod={false} disabledReason="holiday" />
        )

        const holidayButton = screen.getByRole('button', { name: '公共假日无需值班' })
        expect((holidayButton as HTMLButtonElement).disabled).toBe(true)
        fireEvent.click(holidayButton)
        expect(onSignIn).not.toHaveBeenCalled()

        rerender(
            <SignInCard onSignIn={onSignIn} isSigningIn={false} isInDutyPeriod={false} disabledReason="not_assigned" />
        )
        expect((screen.getByRole('button', { name: '您未被安排在当前班次' }) as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByText('当前班次中没有您的排班记录')).toBeTruthy()

        rerender(
            <SignInCard onSignIn={onSignIn} isSigningIn={false} isInDutyPeriod={false} disabledReason="not_in_period" />
        )
        expect((screen.getByRole('button', { name: '当前不在班次时间内' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('starts a check-in only while the member is in an assigned period', () => {
        const onSignIn = vi.fn()
        const { rerender } = render(
            <SignInCard onSignIn={onSignIn} isSigningIn={false} isInDutyPeriod />
        )

        fireEvent.click(screen.getByRole('button', { name: '立即验证定位并签到' }))
        expect(onSignIn).toHaveBeenCalledTimes(1)

        rerender(<SignInCard onSignIn={onSignIn} isSigningIn isInDutyPeriod />)
        expect((screen.getByRole('button', { name: '正在验证定位...' }) as HTMLButtonElement).disabled).toBe(true)

        rerender(<SignInCard onSignIn={onSignIn} isSigningIn={false} hasSignedInToday isInDutyPeriod />)
        expect(screen.getByText('今日已签到')).toBeTruthy()
        expect(screen.queryByRole('button', { name: '立即验证定位并签到' })).toBeNull()
    })
})

describe('LeaveAdminReview', () => {
    it('hides swap-linked leaves and approves or rejects a direct pending leave', () => {
        const approvePendingLeave = vi.fn()
        const deletePendingLeave = vi.fn()
        const { rerender } = render(
            <LeaveAdminReview
                pendingLeaves={[leave(), leave({ id: 'leave-2', reason: '代班' })]}
                swaps={[swap()]}
                approvePendingLeave={approvePendingLeave}
                deletePendingLeave={deletePendingLeave}
                isSwapping={false}
                canReview
            />
        )

        expect(screen.getByText('原因：出差')).toBeTruthy()
        expect(screen.queryByText('原因：代班')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: '批准' }))
        expect(approvePendingLeave).toHaveBeenCalledWith('leave-1')

        fireEvent.click(screen.getByRole('button', { name: '驳回' }))
        expect(deletePendingLeave).toHaveBeenCalledWith('leave-1', {
            title: '已驳回请假',
            description: '该待审批请假与补班安排已清理。',
        })

        rerender(
            <LeaveAdminReview
                pendingLeaves={[leave()]}
                swaps={[]}
                approvePendingLeave={approvePendingLeave}
                deletePendingLeave={deletePendingLeave}
                isSwapping={false}
                canReview={false}
            />
        )
        expect(screen.queryByRole('button', { name: '批准' })).toBeNull()
    })
})
