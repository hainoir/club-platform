import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type SessionBridgeResponse = {
    session?: {
        access_token?: string
        refresh_token?: string
    } | null
}

let inFlightBridge: Promise<boolean> | null = null

export async function rehydrateSessionFromServer(supabase: SupabaseClient<Database>): Promise<boolean> {
    if (inFlightBridge) {
        return inFlightBridge
    }

    inFlightBridge = (async () => {
        try {
            const response = await fetch('/api/auth/session', {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin',
            })

            if (!response.ok) return false
            const payload = (await response.json()) as SessionBridgeResponse
            const accessToken = payload.session?.access_token
            const refreshToken = payload.session?.refresh_token
            if (!accessToken || !refreshToken) return false

            const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            })
            if (error) return false

            return !!data.session
        } catch {
            return false
        } finally {
            inFlightBridge = null
        }
    })()

    return inFlightBridge
}
