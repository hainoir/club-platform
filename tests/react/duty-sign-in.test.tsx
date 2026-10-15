import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDutySignIn } from '@/hooks/duty/useDutySignIn'
import { getStudioLocationHintConfig } from '@/lib/studio/studio-location'

import { createDutySupabase } from './duty-supabase'

const member = {
    id: 'member-1',
    email: 'member@example.com',
    role: '干事' as const,
    name: '甲',
}

function installGeolocation(
    position:
        | { latitude: number; longitude: number; accuracy: number }
        | 'denied'
        | 'empty'
) {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const geolocation: Geolocation = {
        getCurrentPosition(success, error) {
            if (position === 'denied') {
                error?.({
                    code: 1,
                    message: 'Permission denied',
                    PERMISSION_DENIED: 1,
                    POSITION_UNAVAILABLE: 2,
                    TIMEOUT: 3,
                } as GeolocationPositionError)
                return
            }
            if (position === 'empty') {
                success(null as unknown as GeolocationPosition)
                return
            }
            success({
                coords: {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null,
                    toJSON() {
                        return {}
                    },
                },
                timestamp: Date.now(),
                toJSON() {
                    return {}
                },
            })
        },
        watchPosition() {
            return 0
        },
        clearWatch() {
            return undefined
        },
    }
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocation })
}

describe('useDutySignIn', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-10-15T02:00:00.000Z'))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('does not write a check-in when the browser fix is outside the hinted fence', async () => {
        const hint = getStudioLocationHintConfig()
        installGeolocation({
            latitude: hint.latitude + 0.001,
            longitude: hint.longitude,
            accuracy: 5,
        })
        const supabase = createDutySupabase()
        const toast = vi.fn()
        const { result } = renderHook(() => useDutySignIn({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
        }))

        await act(async () => {
            await result.current.performSignIn()
        })

        expect(supabase.rpc).not.toHaveBeenCalled()
        expect(supabase.calls.some((call) => call.method === 'insert')).toBe(false)
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            title: '签到失败',
            variant: 'destructive',
            description: expect.stringMatching(/超出允许范围/),
        }))
    })

    it('submits the measured coordinates through the sign-in RPC', async () => {
        const hint = getStudioLocationHintConfig()
        installGeolocation({
            latitude: hint.latitude,
            longitude: hint.longitude,
            accuracy: 8,
        })
        const supabase = createDutySupabase({
            rpc: async () => ({ data: 'signed_in', error: null }),
        })
        const toast = vi.fn()
        const { result } = renderHook(() => useDutySignIn({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
        }))

        await act(async () => {
            await result.current.performSignIn()
        })

        expect(supabase.calls.filter((call) => call.method === 'insert')).toEqual([])
        expect(supabase.rpc).toHaveBeenCalledWith('submit_duty_sign_in', {
            p_latitude: hint.latitude,
            p_longitude: hint.longitude,
            p_accuracy: 8,
            p_device_info: window.navigator.userAgent,
        })
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '签到成功' }))
    })

    it('shows the server geofence rejection and does not claim success', async () => {
        const hint = getStudioLocationHintConfig()
        installGeolocation({
            latitude: hint.latitude,
            longitude: hint.longitude,
            accuracy: 8,
        })
        const supabase = createDutySupabase({
            rpc: async () => ({
                data: null,
                error: {
                    message: '当前位置距离工作室约 80 米，超出允许范围。',
                    hint: 'out_of_range',
                    details: '80.2',
                },
            }),
        })
        const toast = vi.fn()
        const { result } = renderHook(() => useDutySignIn({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
        }))

        await act(async () => {
            await result.current.performSignIn()
        })

        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            title: '签到失败',
            description: '当前位置距离工作室约 80 米，超出允许范围。',
            variant: 'destructive',
        }))
    })

    it('stops on a denied location before asking the server to write', async () => {
        installGeolocation('denied')
        const supabase = createDutySupabase()
        const toast = vi.fn()
        const { result } = renderHook(() => useDutySignIn({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
        }))

        await act(async () => {
            await result.current.performSignIn()
        })

        expect(supabase.rpc).not.toHaveBeenCalled()
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            description: expect.stringMatching(/定位权限被拒绝/),
        }))
    })

    it('does not sign in again during the cooldown', async () => {
        const hint = getStudioLocationHintConfig()
        installGeolocation({
            latitude: hint.latitude,
            longitude: hint.longitude,
            accuracy: 8,
        })
        const supabase = createDutySupabase({
            rpc: async () => ({ data: 'signed_in', error: null }),
        })
        const toast = vi.fn()
        const { result } = renderHook(() => useDutySignIn({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
        }))

        await act(async () => {
            await result.current.performSignIn()
        })
        vi.setSystemTime(new Date('2026-10-15T02:00:01.000Z'))
        await act(async () => {
            await result.current.performSignIn()
        })

        expect(supabase.rpc).toHaveBeenCalledTimes(1)
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({
            title: '请求过于频繁',
            description: expect.stringMatching(/4 秒/),
        }))
    })

    it('refuses check-in on a public holiday before location or RPC', async () => {
        vi.setSystemTime(new Date('2026-05-01T00:30:00.000Z'))
        const supabase = createDutySupabase()
        const toast = vi.fn()
        const { result } = renderHook(() => useDutySignIn({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
        }))

        await act(async () => {
            await result.current.performSignIn()
        })

        expect(supabase.rpc).not.toHaveBeenCalled()
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '公共假日无需值班' }))
    })

    it('treats an existing log as already signed in without calling the RPC', async () => {
        const supabase = createDutySupabase({
            results: {
                duty_logs: { data: [{ id: 'log-1' }], error: null },
            },
        })
        const toast = vi.fn()
        const { result } = renderHook(() => useDutySignIn({
            supabase: supabase.client,
            user: member,
            toast,
            ensureActiveSession: async () => true,
        }))

        await act(async () => {
            await result.current.performSignIn()
        })

        expect(supabase.rpc).not.toHaveBeenCalled()
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '今日已签到' }))
    })
})
