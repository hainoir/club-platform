import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/components/providers/AuthProvider'
import { useUserStore } from '@/store/useUserStore'

const ensureClientSession = vi.fn()

let authCallback: ((event: string) => void | Promise<void>) | null = null

vi.mock('@/hooks/shared/useSupabase', () => ({
    useSupabase: () => ({
        auth: {
            onAuthStateChange: (callback: (event: string) => void | Promise<void>) => {
                authCallback = callback
                return { data: { subscription: { unsubscribe: () => undefined } } }
            },
        },
    }),
}))

vi.mock('@/utils/supabase/ensure-client-session', () => ({
    ensureClientSession: (...args: unknown[]) => ensureClientSession(...args),
}))

vi.mock('@/utils/supabase/resolve-app-user', () => ({
    resolveAppUser: vi.fn(async () => null),
}))

describe('AuthProvider auth lock', () => {
    beforeEach(() => {
        authCallback = null
        ensureClientSession.mockReset()
        ensureClientSession.mockImplementation(() => new Promise(() => undefined))
        useUserStore.setState({ user: null, isInitialized: false })
    })

    it('returns from onAuthStateChange while session recovery is still pending', async () => {
        render(
            <AuthProvider>
                <div>app</div>
            </AuthProvider>
        )

        await act(async () => {
            await Promise.resolve()
        })

        expect(authCallback).toBeTypeOf('function')
        const callsAfterMount = ensureClientSession.mock.calls.length

        let settled = false
        const callbackDone = Promise.resolve(authCallback?.('SIGNED_IN')).then(() => {
            settled = true
        })

        await act(async () => {
            await Promise.resolve()
        })

        expect(settled).toBe(true)
        expect(ensureClientSession.mock.calls.length).toBe(callsAfterMount)
        await callbackDone
    })
})
