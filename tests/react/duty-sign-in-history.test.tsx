import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInHistoryCard } from '@/components/duty/attendance/SignInHistoryCard';
import type { AppUser } from '@/lib/app-user';
import { addDaysToDateKey, getDutyNow, getDutyWeekMondayDateKey } from '@/lib/duty/duty-time';
import { useUserStore } from '@/store/useUserStore';

import { createDutySupabase } from './duty-supabase';

const harness = vi.hoisted(() => ({
    client: null as ReturnType<typeof createDutySupabase>['client'] | null,
}));

vi.mock('@/hooks/shared/useSupabase', () => ({
    useSupabase: () => harness.client,
}));

const member: AppUser = {
    id: 'member-1',
    email: 'member@example.com',
    role: '干事',
    name: '甲',
};

const admin: AppUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'admin',
    name: '管',
};

function setup(user: AppUser, rows: unknown[] = [], error: { message: string } | null = null) {
    const supabase = createDutySupabase({ results: { duty_logs: { data: rows, error } } });
    harness.client = supabase.client;
    useUserStore.setState({ user, isInitialized: true });
    render(<SignInHistoryCard />);
    return supabase;
}

describe('duty sign-in history', () => {
    beforeEach(() => {
        useUserStore.setState({ user: null, isInitialized: false });
    });

    afterEach(() => {
        cleanup();
        harness.client = null;
        useUserStore.setState({ user: null, isInitialized: false });
    });

    it('renders names, dates, Shanghai times, and both verification states', async () => {
        setup(admin, [
            {
                id: 'log-2', member_id: 'member-2', sign_in_date: '2026-11-12',
                sign_in_time: '2026-11-12T00:15:00Z', location_verified: true,
                member: { id: 'member-2', name: '乙' },
            },
            {
                id: 'log-1', member_id: 'member-1', sign_in_date: '2026-11-11',
                sign_in_time: '2026-11-11T06:05:00Z', location_verified: false,
                member: { id: 'member-1', name: '甲' },
            },
        ]);

        expect(await screen.findByText('乙')).toBeTruthy();
        expect(screen.getByText('2026-11-12 08:15')).toBeTruthy();
        expect(screen.getByText('甲')).toBeTruthy();
        expect(screen.getByText('2026-11-11 14:05')).toBeTruthy();
        expect(screen.getByText('已核验')).toBeTruthy();
        expect(screen.getByText('未核验')).toBeTruthy();
    });

    it('shows an explicit empty state', async () => {
        setup(member);
        expect(await screen.findByText('近八周暂无签到记录。')).toBeTruthy();
    });

    it('filters members to their own ID and requests only safe columns in a bounded newest-first query', async () => {
        const supabase = setup(member);
        await waitFor(() => expect(supabase.calls.some((call) => call.method === 'limit')).toBe(true));

        expect(supabase.calls).toContainEqual(expect.objectContaining({
            table: 'duty_logs', method: 'eq', column: 'member_id', value: 'member-1',
        }));
        expect(supabase.calls).toContainEqual(expect.objectContaining({
            table: 'duty_logs', method: 'gte', column: 'sign_in_date',
            value: addDaysToDateKey(getDutyWeekMondayDateKey(new Date()), -49),
        }));
        expect(supabase.calls).toContainEqual(expect.objectContaining({
            table: 'duty_logs', method: 'lte', column: 'sign_in_date', value: getDutyNow().dateKey,
        }));
        expect(supabase.calls).toContainEqual(expect.objectContaining({
            table: 'duty_logs', method: 'order', column: 'sign_in_time', payload: { ascending: false },
        }));
        expect(supabase.calls).toContainEqual(expect.objectContaining({
            table: 'duty_logs', method: 'limit', value: 50,
        }));

        const selection = String(supabase.calls.find((call) => call.table === 'duty_logs' && call.method === 'select')?.payload);
        expect(selection).toContain('member:members!duty_logs_member_id_fkey(id, name)');
        for (const forbidden of ['latitude', 'longitude', 'accuracy_meters', 'device_info']) {
            expect(selection).not.toContain(forbidden);
        }
        expect(supabase.calls.every((call) => !['insert', 'update', 'delete'].includes(call.method))).toBe(true);
        expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('does not apply the member filter for admins', async () => {
        const supabase = setup(admin);
        await waitFor(() => expect(supabase.calls.some((call) => call.method === 'limit')).toBe(true));
        expect(supabase.calls.some((call) => call.table === 'duty_logs' && call.method === 'eq' && call.column === 'member_id')).toBe(false);
    });

    it('shows a visible error when the query fails', async () => {
        setup(member, [], { message: 'query failed' });
        expect(await screen.findByRole('alert')).toHaveProperty('textContent', '无法读取签到记录，请稍后重试。');
    });
});
