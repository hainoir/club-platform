import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDutyScheduleNotifications } from '@/hooks/notifications/sources/dutySchedule'
import type { SupabaseBrowserClient } from '@/hooks/shared/useSupabase'

import { createDutySupabase } from './duty-supabase'

const user = {
    id: 'auth-user',
    email: 'member@example.com',
    role: '干事' as const,
    name: '甲',
}

describe('duty schedule notifications', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-15T02:00:00.000Z'))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('reads today sign-ins by the resolved member and the Shanghai date', async () => {
        const supabase = createDutySupabase({
            memberId: 'member-1',
            results: {
                duty_rosters: {
                    data: [{ id: 'roster-1', member_id: 'member-1', day_of_week: 4, period: 2 }],
                    error: null,
                },
                duty_leaves: { data: [], error: null },
                duty_logs: {
                    data: [{ sign_in_time: '2026-10-15T02:00:00.000Z' }],
                    error: null,
                },
            },
        })

        await getDutyScheduleNotifications({
            supabase: supabase.client as unknown as SupabaseBrowserClient,
            user,
            isAdmin: false,
            now: new Date('2026-10-15T02:00:00.000Z'),
            dutyReminder: true,
            eventReminder: false,
            keyTransferReminder: false,
        })

        expect(supabase.rpc).toHaveBeenCalledWith('current_member_id')
        expect(supabase.calls).toEqual(expect.arrayContaining([
            expect.objectContaining({ table: 'duty_logs', method: 'eq', column: 'member_id', value: 'member-1' }),
            expect.objectContaining({ table: 'duty_logs', method: 'eq', column: 'sign_in_date', value: '2026-10-15' }),
            expect.objectContaining({ table: 'duty_rosters', method: 'eq', column: 'member_id', value: 'member-1' }),
        ]))
        expect(supabase.calls.some((call) => call.table === 'duty_logs' && call.method === 'gte')).toBe(false)
        expect(supabase.calls.some((call) => call.value === 'auth-user')).toBe(false)
    })
})
