import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DutySignInAdminSection } from '@/components/duty/attendance/DutySignInAdminSection';
import type { RosterWithMember } from '@/hooks/useDuty';

const harness = vi.hoisted(() => ({
    role: 'admin',
    supabase: null as ReturnType<typeof createSupabase> | null,
    toast: vi.fn(),
    requireAuth: async () => true,
}));

vi.mock('@/hooks/shared/useSupabase', () => ({ useSupabase: () => harness.supabase }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/hooks/shared/useProtectedAction', () => ({ useProtectedAction: () => ({ requireAuth: harness.requireAuth }) }));
vi.mock('@/utils/supabase/ensure-client-session', () => ({ ensureClientSession: async () => ({ access_token: 'test' }) }));
vi.mock('@/components/ui/toast-simple', () => ({ useToast: () => ({ toast: harness.toast }) }));
vi.mock('@/store/useUserStore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/store/useUserStore')>();
    return { ...actual, useUserStore: () => ({ user: { id: 'admin-1', role: harness.role } }) };
});

function createSupabase(options?: { rpcError?: { message: string }; manyLogs?: boolean }) {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const logs = options?.manyLogs
        ? Array.from({ length: 31 }, (_, index) => ({ id: `log-${index + 1}`, member_id: 'member-1', sign_in_time: new Date(Date.UTC(2026, 10, 11) - index * 86_400_000).toISOString(), location_verified: true }))
        : [{ id: 'log-1', member_id: 'member-1', sign_in_time: '2026-11-11T00:00:00Z', location_verified: true }];
    const events = [{ id: 'event-1', action: 'backfill', created_at: '2026-11-11T00:00:00Z', reason: '先前补签', target_member_id: 'member-1', sign_in_time: '2026-11-11T00:00:00Z' }];
    return {
        rpcCalls,
        from(table: string) {
            let fields = '';
            let rangeEnd = Number.POSITIVE_INFINITY;
            const builder = {
                select(value: string) { fields = value; return builder; },
                order() { return builder; }, limit() { return builder; }, range(_start: number, end: number) { rangeEnd = end; return builder; }, gte() { return builder; }, eq() { return builder; },
                abortSignal() { return Promise.resolve({ data: [], error: null }); },
                then(resolve: (value: unknown) => unknown) {
                    const data = table === 'duty_sign_in_admin_events' ? events : fields.includes('location_verified') ? logs.slice(0, rangeEnd + 1) : [];
                    return Promise.resolve({ data, error: null }).then(resolve);
                },
            };
            return builder;
        },
        async rpc(name: string, args: Record<string, unknown>) {
            rpcCalls.push({ name, args });
            return { data: null, error: options?.rpcError ?? null };
        },
    };
}

const rosters: RosterWithMember[] = [{
    id: 'roster-1', member_id: 'member-1', day_of_week: 4, period: 1, has_key: false,
    created_at: '2026-11-01T00:00:00Z', member: { id: 'member-1', name: '甲', student_id: null },
}];

describe('admin duty sign-in management', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-13T08:00:00Z'));
        harness.role = 'admin';
        harness.supabase = createSupabase();
        harness.toast.mockClear();
    });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('prefills a missed slot and backfills through the RPC with a trimmed reason and Shanghai instant', async () => {
        render(<DutySignInAdminSection rosters={rosters} absentRosters={rosters} />);
        fireEvent.click(await screen.findByRole('button', { name: '补签' }));
        expect((screen.getByLabelText('成员') as HTMLSelectElement).value).toBe('member-1');
        expect((screen.getByLabelText('日期（上海）') as HTMLInputElement).value).toBe('2026-11-12');
        expect((screen.getByLabelText('时间（上海）') as HTMLInputElement).value).toBe('08:00');
        fireEvent.change(screen.getByLabelText('补签原因'), { target: { value: '  忘记签到  ' } });
        fireEvent.click(screen.getByRole('button', { name: '确认补签' }));
        await waitFor(() => expect(harness.supabase?.rpcCalls).toEqual([{
            name: 'admin_backfill_duty_sign_in',
            args: { p_member_id: 'member-1', p_sign_in_time: '2026-11-12T00:00:00.000Z', p_reason: '忘记签到' },
        }]));
        expect(screen.getByText('先前补签')).toBeTruthy();
    });

    it('marks a verified log invalid through the RPC', async () => {
        render(<DutySignInAdminSection rosters={rosters} absentRosters={[]} />);
        fireEvent.click(await screen.findByRole('button', { name: '标为无效' }));
        fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '核实签到无效' } });
        fireEvent.click(screen.getByRole('button', { name: '确认作废' }));
        await waitFor(() => expect(harness.supabase?.rpcCalls).toEqual([{
            name: 'mark_duty_sign_in_invalid', args: { p_log_id: 'log-1', p_reason: '核实签到无效' },
        }]));
    });

    it('deletes a log through the RPC', async () => {
        render(<DutySignInAdminSection rosters={rosters} absentRosters={[]} />);
        fireEvent.click(await screen.findByRole('button', { name: '删除' }));
        fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '重复记录' } });
        fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
        await waitFor(() => expect(harness.supabase?.rpcCalls).toEqual([{
            name: 'delete_duty_sign_in', args: { p_log_id: 'log-1', p_reason: '重复记录' },
        }]));
    });

    it('lets an admin reach older logs for correction', async () => {
        harness.supabase = createSupabase({ manyLogs: true });
        render(<DutySignInAdminSection rosters={rosters} absentRosters={[]} />);
        fireEvent.click(await screen.findByRole('button', { name: '加载更早记录' }));
        await waitFor(() => expect(screen.getAllByRole('button', { name: '删除' })).toHaveLength(31));
    });

    it('blocks blank reasons and times outside the rostered window', async () => {
        render(<DutySignInAdminSection rosters={rosters} absentRosters={[]} />);
        fireEvent.change(screen.getByLabelText('成员'), { target: { value: 'member-1' } });
        fireEvent.change(screen.getByLabelText('日期（上海）'), { target: { value: '2026-11-12' } });
        fireEvent.change(screen.getByLabelText('时间（上海）'), { target: { value: '08:00' } });
        fireEvent.click(screen.getByRole('button', { name: '确认补签' }));
        expect((await screen.findByRole('alert')).textContent).toContain('原因需为 1 到 200 字');
        fireEvent.change(screen.getByLabelText('补签原因'), { target: { value: '  ' } });
        fireEvent.click(screen.getByRole('button', { name: '确认补签' }));
        expect(harness.supabase?.rpcCalls).toHaveLength(0);
        fireEvent.change(screen.getByLabelText('补签原因'), { target: { value: '补签' } });
        fireEvent.change(screen.getByLabelText('时间（上海）'), { target: { value: '18:00' } });
        fireEvent.click(screen.getByRole('button', { name: '确认补签' }));
        expect((await screen.findByRole('alert')).textContent).toContain('节次窗口');
        expect(harness.supabase?.rpcCalls).toHaveLength(0);
        fireEvent.click(await screen.findByRole('button', { name: '删除' }));
        fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '  ' } });
        fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
        expect(harness.supabase?.rpcCalls).toHaveLength(0);
    });

    it('hides all management controls for a non-admin', async () => {
        harness.role = '干事';
        render(<DutySignInAdminSection rosters={rosters} absentRosters={rosters} />);
        expect(await screen.findByText('本周未签到人员')).toBeTruthy();
        expect(screen.queryByText('签到管理')).toBeNull();
        expect(screen.queryByRole('button', { name: '补签' })).toBeNull();
        expect(screen.queryByRole('button', { name: '删除' })).toBeNull();
        expect(harness.supabase?.rpcCalls).toHaveLength(0);
    });

    it('shows the server RPC error text', async () => {
        harness.supabase = createSupabase({ rpcError: { message: '该签到已无效' } });
        render(<DutySignInAdminSection rosters={rosters} absentRosters={[]} />);
        fireEvent.click(await screen.findByRole('button', { name: '标为无效' }));
        fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '检查错误' } });
        fireEvent.click(screen.getByRole('button', { name: '确认作废' }));
        expect((await screen.findByRole('alert')).textContent).toContain('该签到已无效');
        expect(harness.toast).toHaveBeenCalledWith(expect.objectContaining({ description: '该签到已无效', variant: 'destructive' }));
    });
});
