import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DashboardSignInWidget } from '@/components/dashboard/DashboardSignInWidget'
import { SignInCard } from '@/components/duty/attendance/SignInCard'

const harness = vi.hoisted(() => ({
    loadStudioGeofence: vi.fn(),
    supabase: { from: vi.fn() },
}))

vi.mock('@/hooks/shared/useSupabase', () => ({
    useSupabase: () => harness.supabase,
}))

vi.mock('@/lib/studio/studio-location', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/studio/studio-location')>()
    return {
        ...actual,
        loadStudioGeofence: (...args: unknown[]) => harness.loadStudioGeofence(...args),
    }
})

function cardText() {
    return (screen.getByText(/基于地理边界验证/).textContent ?? '').replace(/\s+/g, '')
}

describe('SignInCard radius copy', () => {
    afterEach(() => {
        cleanup()
    })

    it('shows a live radius and omits the number until one is available', () => {
        const onSignIn = vi.fn()
        const { rerender } = render(<SignInCard onSignIn={onSignIn} isSigningIn={false} />)

        expect(cardText()).toBe('基于地理边界验证。请确保您已身处系统设定的工作室范围内。')
        expect(cardText()).not.toMatch(/\d/)

        rerender(<SignInCard onSignIn={onSignIn} isSigningIn={false} radiusMeters={80} />)
        expect(cardText()).toContain('工作室80米')

        rerender(<SignInCard onSignIn={onSignIn} isSigningIn={false} radiusMeters={50} />)
        expect(cardText()).toContain('工作室50米')

        rerender(<SignInCard onSignIn={onSignIn} isSigningIn={false} radiusMeters={50.54} />)
        expect(cardText()).toContain('工作室50.5米')

        rerender(<SignInCard onSignIn={onSignIn} isSigningIn={false} radiusMeters={Number.NaN} />)
        expect(cardText()).not.toMatch(/\d/)
    })
})

describe('DashboardSignInWidget radius', () => {
    afterEach(() => {
        cleanup()
        harness.loadStudioGeofence.mockReset()
    })

    it('renders the radius returned by studio_geofence and hides it while that read is pending', async () => {
        let resolveFence: (fence: {
            latitude: number
            longitude: number
            radiusMeters: number
            maxAccuracyMeters: number
        }) => void = () => {}
        harness.loadStudioGeofence.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveFence = resolve
                })
        )

        render(
            <DashboardSignInWidget
                memberId="member-1"
                todayAssignedPeriods={[]}
                initialHasSignedInToday={false}
            />
        )

        expect(harness.loadStudioGeofence).toHaveBeenCalledWith(harness.supabase)
        expect(cardText()).not.toMatch(/\d/)

        resolveFence({
            latitude: 39.181074,
            longitude: 117.12138,
            radiusMeters: 80,
            maxAccuracyMeters: 100,
        })

        await waitFor(() => {
            expect(cardText()).toContain('工作室80米')
        })
    })

    it('keeps the number-free sentence when the geofence read fails', async () => {
        harness.loadStudioGeofence.mockRejectedValue(new Error('geofence_unconfigured'))

        render(
            <DashboardSignInWidget
                memberId="member-1"
                todayAssignedPeriods={[]}
                initialHasSignedInToday={false}
            />
        )

        await waitFor(() => {
            expect(harness.loadStudioGeofence).toHaveBeenCalled()
        })
        expect(cardText()).toBe('基于地理边界验证。请确保您已身处系统设定的工作室范围内。')
    })
})
