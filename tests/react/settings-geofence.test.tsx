import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SettingsClient from '@/components/settings/SettingsClient'
import { GeofenceTab } from '@/components/settings/GeofenceTab'
import type { SettingsProfile } from '@/components/settings/settings-types'

vi.mock('next-themes', () => ({
    useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

const harness = vi.hoisted(() => ({
    supabase: null as ReturnType<typeof createGeofenceSupabase> | null,
}))

vi.mock('@/hooks/shared/useSupabase', () => ({
    useSupabase: () => harness.supabase,
}))

interface FenceRow {
    latitude: number
    longitude: number
    radius_meters: number
    max_accuracy_meters: number
}

interface AuditRow {
    id: string
    created_at: string
    reason: string
    latitude: number
    longitude: number
    radius_meters: number
    max_accuracy_meters: number
}

function createGeofenceSupabase(options?: {
    fence?: FenceRow | null
    audits?: AuditRow[]
    rpcError?: { message: string; hint?: string } | null
}) {
    const fence = options?.fence === undefined
        ? {
            latitude: 39.181074,
            longitude: 117.12138,
            radius_meters: 50,
            max_accuracy_meters: 100,
        }
        : options.fence
    const audits = options?.audits ?? []
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
    const state = {
        fence: { data: fence, error: null as { message: string } | null },
        audits: { data: audits, error: null as { message: string } | null },
        rpcError: options?.rpcError ?? null,
    }

    const table = (result: { data: unknown; error: { message: string } | null }) => {
        const promise = Promise.resolve(result)
        const builder = {
            select: () => builder,
            eq: () => builder,
            order: () => builder,
            limit: () => builder,
            maybeSingle: () => promise,
            then: promise.then.bind(promise),
        }
        return builder
    }

    return {
        rpcCalls,
        from(name: string) {
            if (name === 'studio_geofence') return table(state.fence)
            return table(state.audits)
        },
        async rpc(name: string, args: Record<string, unknown>) {
            rpcCalls.push({ name, args })
            if (state.rpcError) return { data: null, error: state.rpcError }
            state.fence = {
                data: {
                    latitude: Number(args.p_latitude),
                    longitude: Number(args.p_longitude),
                    radius_meters: Number(args.p_radius_meters),
                    max_accuracy_meters: Number(args.p_max_accuracy_meters),
                },
                error: null,
            }
            state.audits = {
                data: [
                    {
                        id: 'audit-new',
                        created_at: '2026-10-15T04:00:00.000Z',
                        reason: String(args.p_reason),
                        latitude: Number(args.p_latitude),
                        longitude: Number(args.p_longitude),
                        radius_meters: Number(args.p_radius_meters),
                        max_accuracy_meters: Number(args.p_max_accuracy_meters),
                    },
                    ...state.audits.data,
                ],
                error: null,
            }
            return { data: null, error: null }
        },
    }
}

function profile(role: string): SettingsProfile {
    return {
        id: 'member-1',
        email: 'member@example.com',
        name: '甲',
        role,
        department: null,
        grade: null,
        studentId: null,
    }
}

describe('studio geofence settings', () => {
    beforeEach(() => {
        harness.supabase = createGeofenceSupabase()
    })

    afterEach(() => {
        cleanup()
    })

    it('hides the geofence tab from members and shows it to fence admins', async () => {
        const { rerender } = render(<SettingsClient profile={profile('干事')} />)
        expect(screen.queryByRole('tab', { name: '工作室围栏' })).toBeNull()

        rerender(<SettingsClient profile={profile('主席')} />)
        expect(screen.getByRole('tab', { name: '工作室围栏' })).toBeTruthy()

        rerender(<SettingsClient profile={profile('部长')} />)
        expect(screen.getByRole('tab', { name: '工作室围栏' })).toBeTruthy()
    })

    it('loads the current fence and rejects a radius outside 20 to 200 before calling the RPC', async () => {
        const supabase = createGeofenceSupabase()
        const toast = vi.fn()
        render(<GeofenceTab supabase={supabase as never} toast={toast} />)

        expect(await screen.findByDisplayValue('50')).toBeTruthy()
        expect(screen.getByDisplayValue('39.181074')).toBeTruthy()
        expect(screen.getByDisplayValue('100')).toBeTruthy()
        expect(screen.getByText('还没有围栏修改记录。')).toBeTruthy()

        fireEvent.change(screen.getByLabelText('半径（米）'), { target: { value: '10' } })
        fireEvent.change(screen.getByLabelText('原因'), { target: { value: '半径太小' } })
        fireEvent.click(screen.getByRole('button', { name: '保存围栏' }))

        expect((await screen.findByRole('alert')).textContent).toContain('围栏半径必须在 20 到 200 米之间。')
        expect(supabase.rpcCalls).toHaveLength(0)
        expect(toast).not.toHaveBeenCalled()
    })

    it('saves through update_studio_geofence and shows the new audit', async () => {
        const supabase = createGeofenceSupabase()
        const toast = vi.fn()
        render(<GeofenceTab supabase={supabase as never} toast={toast} />)
        await screen.findByDisplayValue('50')

        fireEvent.change(screen.getByLabelText('半径（米）'), { target: { value: '80' } })
        fireEvent.change(screen.getByLabelText('精度上限（米）'), { target: { value: '30' } })
        fireEvent.change(screen.getByLabelText('原因'), { target: { value: '半径改为 80' } })
        fireEvent.click(screen.getByRole('button', { name: '保存围栏' }))

        await waitFor(() => {
            expect(screen.getByRole('status').textContent).toContain('围栏已更新')
        })
        expect(supabase.rpcCalls).toEqual([
            {
                name: 'update_studio_geofence',
                args: {
                    p_latitude: 39.181074,
                    p_longitude: 117.12138,
                    p_radius_meters: 80,
                    p_max_accuracy_meters: 30,
                    p_reason: '半径改为 80',
                },
            },
        ])
        expect(screen.getByText('半径改为 80')).toBeTruthy()
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '围栏已更新' }))
    })

    it('shows the RPC error message when the save is rejected', async () => {
        const supabase = createGeofenceSupabase({
            rpcError: { message: '只有管理员可以执行此操作。', hint: 'not_admin' },
        })
        render(<GeofenceTab supabase={supabase as never} toast={vi.fn()} />)
        await screen.findByDisplayValue('50')

        fireEvent.change(screen.getByLabelText('原因'), { target: { value: '试一下' } })
        fireEvent.click(screen.getByRole('button', { name: '保存围栏' }))

        expect((await screen.findByRole('alert')).textContent).toContain('只有管理员可以执行此操作。')
        expect(supabase.rpcCalls).toHaveLength(1)
    })
})
