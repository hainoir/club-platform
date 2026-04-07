import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type SessionBridgeResponse = {
    session?: {
        access_token?: string
        refresh_token?: string
    } | null
}

let inFlightBridge: Promise<boolean> | null = null

/**
 * 【学习注释：服务端 session 回填到浏览器】
 * 前端拿不到 HttpOnly cookie，所以需要通过受控接口把服务端仍然有效的 token 回填给 Supabase client。
 * 这个过程本质上是“让浏览器内存重新认识当前登录态”，而不是重新登录一次。
 */
export async function rehydrateSessionFromServer(supabase: SupabaseClient<Database>): Promise<boolean> {
    // 【学习注释：并发去重】
    // 多个组件同时发现 session 丢失时，只放行一个桥接请求，避免重复打后端接口。
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
