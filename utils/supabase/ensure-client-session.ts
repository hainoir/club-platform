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
    // 【面试考点：前端并发请求与会话缓存】
    // 在客户端由于并发渲染特性或多个组件同时挂载，可能会在一瞬间发起多次鉴权请求。
    // 这个函数借助底层缓存机制，可有效防止重复的无意义网络请求，减轻鉴权服务压力。
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
        return null
    }

    // 本地没有可刷新的鉴权状态。
    if (!session) {
        return null
    }

    if (hasEnoughValidity(session, minValidityMs)) {
        return session
    }

    // 【面试考点：刷新机制（静默刷新）】
    // 尝试无感刷新令牌。由于访问令牌寿命较短（出于安全考虑），这里会静默使用刷新令牌换取新令牌。
    const {
        data: { session: refreshedSession },
        error: refreshError,
    } = await supabase.auth.refreshSession()

    // 过期或失效的刷新令牌应视为已登出状态。
    if (refreshError) {
        await supabase.auth.signOut()
        return null
    }

    if (hasEnoughValidity(refreshedSession, minValidityMs)) {
        return refreshedSession
    }

    // 【面试考点：服务端水合与状态同步（会话重建）】
    // 如果客户端通过前面的方法仍未取到合法会话，可能是服务端已登录但客户端上下文缓存丢失。
    // 我们在此触发专门的重水合流程，拉取服务端仅后端可读标记中保存的最新鉴权状态。
    const bridged = await rehydrateSessionFromServer(supabase)
    if (!bridged) {
        return null
    }

    const {
        data: { session: bridgedSession },
    } = await supabase.auth.getSession()

    return hasEnoughValidity(bridgedSession, minValidityMs) ? bridgedSession : null
}
