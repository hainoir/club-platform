import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompensationScheduleCard } from '@/components/duty/leave/CompensationScheduleCard';
import { useDutyCompensations, type CompensationWithDetails } from '@/hooks/duty/useDutyCompensations';
import type { AppUser } from '@/lib/app-user';

import { createDutySupabase } from './duty-supabase';

const member: AppUser = { id: 'member-1', email: 'member@example.com', role: '干事', name: '甲' };
const admin: AppUser = { id: 'admin-1', email: 'admin@example.com', role: 'admin', name: '管' };

function compensation(id: string, date: string, period: number, status = 'pending'): CompensationWithDetails {
    return {
        id,
        member_id: 'member-1',
        compensation_date: date,
        day_of_week: date === '2026-11-16' ? 1 : date === '2026-11-12' ? 4 : 5,
        period,
        member: { name: `成员${id}` },
        leave: { status },
    };
}

describe('CompensationScheduleCard', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-13T04:00:00.000Z'));
    });

    afterEach(() => vi.useRealTimers());

    it('renders upcoming slots first and past slots newest first', () => {
        render(<CompensationScheduleCard
            compensations={[
                compensation('past-yesterday', '2026-11-12', 4, 'approved'),
                compensation('upcoming-monday', '2026-11-16', 1),
                compensation('past-today', '2026-11-13', 1),
                compensation('upcoming-today', '2026-11-13', 3),
            ]}
            isLoading={false}
            hasError={false}
        />);

        const rows = screen.getAllByRole('listitem').map((row) => row.firstElementChild?.textContent);
        expect(rows).toEqual([
            '成员upcoming-today', '成员upcoming-monday', '成员past-today', '成员past-yesterday',
        ]);
        expect(within(screen.getByLabelText('待补班')).getByText(/2026-11-13 · 周五 · 第三大节/)).toBeTruthy();
        expect(screen.getByText('请假已批准')).toBeTruthy();
    });

    it('shows an explicit empty state', () => {
        render(<CompensationScheduleCard compensations={[]} isLoading={false} hasError={false} />);
        expect(screen.getByText('暂无补班安排。')).toBeTruthy();
    });
});

describe('useDutyCompensations', () => {
    it('filters a member query to their own rows', async () => {
        const supabase = createDutySupabase({ results: { duty_compensations: { data: [], error: null } } });
        renderHook(() => useDutyCompensations(supabase.client, member));

        await waitFor(() => expect(supabase.calls).toContainEqual({
            table: 'duty_compensations', method: 'eq', column: 'member_id', value: 'member-1',
        }));
        expect(supabase.calls.some((call) => call.method === 'insert' || call.method === 'delete')).toBe(false);
    });

    it('lets RLS determine the admin-visible set', async () => {
        const supabase = createDutySupabase({ results: { duty_compensations: { data: [], error: null } } });
        renderHook(() => useDutyCompensations(supabase.client, admin));

        await waitFor(() => expect(supabase.calls.some((call) => call.table === 'duty_compensations' && call.method === 'select')).toBe(true));
        expect(supabase.calls.some((call) => call.table === 'duty_compensations' && call.method === 'eq')).toBe(false);
    });

    it('pages through records past the PostgREST cap', async () => {
        const firstPage = Array.from({ length: 1000 }, (_, i) => compensation(`page-${i}`, '2026-11-16', 1));
        const secondPage = [compensation('overflow', '2026-11-17', 2, 'approved')];
        const supabase = createDutySupabase({
            results: {
                duty_compensations: [
                    { data: firstPage, error: null },
                    { data: secondPage, error: null },
                ],
            },
        });
        const { result } = renderHook(() => useDutyCompensations(supabase.client, admin));

        await waitFor(() => expect(result.current.compensations).toHaveLength(1001));
        expect(result.current.compensations.at(-1)?.id).toBe('overflow');
        expect(supabase.calls.filter((call) => call.method === 'range')).toEqual([
            { table: 'duty_compensations', method: 'range', value: { from: 0, to: 999 } },
            { table: 'duty_compensations', method: 'range', value: { from: 1000, to: 1999 } },
        ]);
    });
});
