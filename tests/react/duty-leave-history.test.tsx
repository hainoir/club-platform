import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LeaveHistoryCard } from '@/components/duty/leave/LeaveHistoryCard'
import type { DutySupabaseClient, LeaveWithMember } from '@/hooks/duty/types'
import type { AppUser } from '@/lib/app-user'
import { useUserStore } from '@/store/useUserStore'

import { createDutySupabase } from './duty-supabase'

let testClient: DutySupabaseClient
vi.mock('@/hooks/shared/useSupabase', () => ({ useSupabase: () => testClient }))

const member: AppUser = {
    id: 'member-1', email: 'member@example.com', role: '干事', name: '甲',
}
const admin: AppUser = {
    id: 'admin-1', email: 'admin@example.com', role: 'admin', name: '管',
}

function leave(overrides: Partial<LeaveWithMember> = {}): LeaveWithMember {
    return {
        id: 'leave-1',
        member_id: 'member-1',
        leave_date: '2099-01-05',
        day_of_week: 1,
        period: 2,
        status: 'pending',
        reason: '出差',
        penalty_shifts: 1,
        expires_at: '2099-01-05T10:00:00Z',
        created_at: '2026-11-01T00:00:00Z',
        member: { id: 'member-1', name: '甲' },
        ...overrides,
    }
}

beforeEach(() => useUserStore.setState({ user: member }))
afterEach(() => useUserStore.setState({ user: null }))

describe('LeaveHistoryCard', () => {
    it('shows pending and past approved leaves with their details, without any writes', async () => {
        const supabase = createDutySupabase({ results: {
            duty_leaves: { data: [
                leave(),
                leave({
                    id: 'leave-2', status: 'approved', leave_date: '2025-01-06',
                    expires_at: '2025-01-06T10:00:00Z', reason: '病假', penalty_shifts: 2,
                }),
            ], error: null },
        } })
        testClient = supabase.client

        render(<LeaveHistoryCard />)

        expect(await screen.findByText('原因：出差')).toBeTruthy()
        expect(screen.getByText('原因：病假')).toBeTruthy()
        expect(screen.getByText('待审批')).toBeTruthy()
        expect(screen.getByText('已批准')).toBeTruthy()
        expect(screen.getByText('补班 1 节')).toBeTruthy()
        expect(screen.getByText('补班 2 节')).toBeTruthy()
        expect(screen.getAllByText('周一 第2大节')).toHaveLength(2)
        expect(screen.getByText('甲 · 2099-01-05')).toBeTruthy()
        expect(screen.getByText('甲 · 2025-01-06')).toBeTruthy()
        expect(supabase.calls.find((call) => call.method === 'select')?.payload).toBe(
            'id, member_id, leave_date, day_of_week, period, status, reason, penalty_shifts, expires_at, created_at, member:members!duty_leaves_member_id_fkey(id, name)'
        )
        expect(supabase.calls.every((call) => ['select', 'eq', 'order', 'limit'].includes(call.method))).toBe(true)
        expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('puts upcoming rows ahead of past rows even when the past row was created later', async () => {
        const supabase = createDutySupabase({ results: {
            duty_leaves: { data: [
                leave({ id: 'past', leave_date: '2025-01-06', expires_at: '2025-01-06T10:00:00Z', created_at: '2026-11-13T00:00:00Z' }),
                leave({ id: 'upcoming', created_at: '2026-11-01T00:00:00Z' }),
            ], error: null },
        } })
        testClient = supabase.client

        render(<LeaveHistoryCard />)
        const items = await screen.findAllByRole('listitem')
        expect(within(items[0]).getByText('甲 · 2099-01-05')).toBeTruthy()
        expect(within(items[1]).getByText('甲 · 2025-01-06')).toBeTruthy()
        expect(within(items[0]).getByText('待审批')).toBeTruthy()
    })

    it('shows an empty state when there are no visible rows', async () => {
        const supabase = createDutySupabase({ results: { duty_leaves: { data: [], error: null } } })
        testClient = supabase.client

        render(<LeaveHistoryCard />)
        expect(await screen.findByText('暂无请假记录。')).toBeTruthy()
    })

    it('shows a query error instead of an empty state', async () => {
        const supabase = createDutySupabase({ results: {
            duty_leaves: { data: null, error: { message: 'network error' } },
        } })
        testClient = supabase.client

        render(<LeaveHistoryCard />)
        expect(await screen.findByRole('alert')).toHaveProperty('textContent', '请假记录加载失败，请稍后重试。')
        expect(screen.queryByText('暂无请假记录。')).toBeNull()
    })

    it.each([
        { label: 'member', user: member, hasMemberFilter: true },
        { label: 'admin', user: admin, hasMemberFilter: false },
    ])('$label scopes the history query correctly and never filters out expired rows', async ({ user, hasMemberFilter }) => {
        useUserStore.setState({ user })
        const supabase = createDutySupabase({ results: { duty_leaves: { data: [], error: null } } })
        testClient = supabase.client

        render(<LeaveHistoryCard />)
        await screen.findByText('暂无请假记录。')

        const calls = supabase.calls.filter((call) => call.table === 'duty_leaves')
        expect(calls.some((call) => call.method === 'select')).toBe(true)
        expect(calls.some((call) => call.method === 'limit' && call.value === 100)).toBe(true)
        expect(calls.some((call) => call.method === 'eq' && call.column === 'member_id' && call.value === user.id)).toBe(hasMemberFilter)
        expect(calls.some((call) => call.column === 'expires_at' && ['gt', 'gte', 'eq'].includes(call.method))).toBe(false)
        expect(calls.some((call) => call.method === 'eq' && call.column === 'status')).toBe(false)
    })
})
