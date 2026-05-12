import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { rehydrateSessionFromServer } from '@/utils/supabase/rehydrate'

const DEFAULT_MIN_VALIDITY_MS = 60_000

// 【学习注释：有效期守卫】
// 客户端不只关心“有没有会话”，还关心它还能不能撑过接下来的写操作。
function hasEnoughValidity(session: Session | null, minValidityMs: number): session is Session {
    if (!session) return false

    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    return expiresAt > Date.now() + minValidityMs
}

/**
 * 【学习注释：服务端到客户端的会话桥接】
 * 当浏览器内存里的会话丢失，但服务端 cookie 里仍然存在有效登录态时，
 * 这里会向后端取回 token 再回填到 Supabase 客户端，避免用户被误判成退出登录。
 */
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

/**
 * 【学习注释：客户端写操作前的会话续命】
 * 这段逻辑会按“读本地会话 -> 必要时刷新 -> 仍失败则桥接服务端会话”的顺序兜底。
 * 对业务层来说，它把复杂的鉴权恢复细节折叠成了一个布尔意义明确的前置步骤。
 */
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

    // 【学习注释：本地会话快过期时先尝试刷新】

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
        // 【学习注释：确认失效后主动清理前端状态】
        // 继续保留坏掉的 token 只会让后续请求重复失败，所以这里直接退出登录，把状态拉回一个干净起点。
        await supabase.auth.signOut()
    }

    return null
}
