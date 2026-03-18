import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { rehydrateSessionFromServer } from '@/utils/supabase/rehydrate'

const DEFAULT_MIN_VALIDITY_MS = 60_000

function hasEnoughValidity(session: Session | null, minValidityMs: number): session is Session {
    if (!session) return false

    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    return expiresAt > Date.now() + minValidityMs
}

export async function ensureClientSession(
    supabase: SupabaseClient<Database>,
    minValidityMs = DEFAULT_MIN_VALIDITY_MS
): Promise<Session | null> {
    // 【面试考点：前端并发请求与 Session 缓存】
    // 在客户端由于 React 并发特性或多个组件同时挂载，可能会在一瞬间发起多次鉴权请求。
    // 这个函数的存在并借助 Supabase 底层缓存机制，有效防止了重复的无意义网络请求，减轻鉴权服务器压力。
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
        return null
    }

    // No local auth state to refresh.
    if (!session) {
        return null
    }

    if (hasEnoughValidity(session, minValidityMs)) {
        return session
    }

    // 【面试考点：刷新机制 (Silent Auth Refresh)】
    // 尝试无感刷新令牌。由于 Access Token 寿命较短（出于安全考虑），我们在客户端静默尝试通过 Refresh Token 换取新令牌。
    const {
        data: { session: refreshedSession },
        error: refreshError,
    } = await supabase.auth.refreshSession()

    // Stale/invalid refresh token should be treated as signed-out state.
    if (refreshError) {
        await supabase.auth.signOut()
        return null
    }

    if (hasEnoughValidity(refreshedSession, minValidityMs)) {
        return refreshedSession
    }

    // 【面试考点：SSR 水合与状态同步 (Session Rehydration)】
    // 如果客户端通过前面的方法均未取到合法的 Session，存在一种情况是服务端已经完成了登录，但客户端的上下文环境丢失了缓存。
    // 我们在此触发一个专门的重水合过程，拉取服务端安全 HttpOnly Cookie 中保存的最新鉴权状态。
    const bridged = await rehydrateSessionFromServer(supabase)
    if (!bridged) {
        return null
    }

    const {
        data: { session: bridgedSession },
    } = await supabase.auth.getSession()

    return hasEnoughValidity(bridgedSession, minValidityMs) ? bridgedSession : null
}
