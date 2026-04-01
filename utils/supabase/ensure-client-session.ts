import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { rehydrateSessionFromServer } from '@/utils/supabase/rehydrate'

const DEFAULT_MIN_VALIDITY_MS = 60_000

function hasEnoughValidity(session: Session | null, minValidityMs: number): session is Session {
    if (!session) return false

    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    return expiresAt > Date.now() + minValidityMs
}

async function bridgeSessionFromServer(
    supabase: SupabaseClient<Database>,
    _minValidityMs: number
): Promise<Session | null> {
    const bridged = await rehydrateSessionFromServer(supabase)
    if (!bridged) {
        return null
    }

    const {
        data: { session },
        error,
    } = await supabase.auth.getSession()

    if (error) {
        return null
    }

    return session
}

export async function ensureClientSession(
    supabase: SupabaseClient<Database>,
    minValidityMs = DEFAULT_MIN_VALIDITY_MS
): Promise<Session | null> {
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession()

    let currentSession = session

    if (sessionError || !currentSession) {
        currentSession = await bridgeSessionFromServer(supabase, minValidityMs)
        if (!currentSession) {
            return null
        }
    }

    if (hasEnoughValidity(currentSession, minValidityMs)) {
        return currentSession
    }

    const {
        data: { session: refreshedSession },
        error: refreshError,
    } = await supabase.auth.refreshSession()

    if (!refreshError && hasEnoughValidity(refreshedSession, minValidityMs)) {
        return refreshedSession
    }

    const bridgedSession = await bridgeSessionFromServer(supabase, minValidityMs)
    if (bridgedSession && hasEnoughValidity(bridgedSession, minValidityMs)) {
        return bridgedSession
    }

    if (refreshError) {
        await supabase.auth.signOut()
    }

    return null
}
