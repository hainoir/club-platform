import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null
let serverRenderFallbackClient: SupabaseClient<Database> | null = null

function missingSupabaseEnvError() {
    return new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
            'Set them in your runtime environment.'
    )
}

function createServerRenderFallback(): SupabaseClient<Database> {
    const error = missingSupabaseEnvError()

    return new Proxy({} as SupabaseClient<Database>, {
        get() {
            throw error
        },
    })
}

/**
 * 【学习注释：浏览器端 Supabase 单例】
 * 客户端组件会频繁重渲染，所以这里把浏览器端 Supabase 实例缓存成单例，避免重复创建连接器。
 * 由于前端只能拿到匿名公钥，真正的安全边界不在这里，而是在 Supabase 的 RLS（行级权限）策略。
 */
export function createClient() {
    if (browserClient) return browserClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        // 【学习注释：预渲染兜底】
        // 某些客户端模块在构建或预渲染阶段也会先被服务端触达，这里返回一个只会在真正调用时报错的代理对象，
        // 让页面能把问题收敛到运行时，而不是在构建阶段直接整页崩掉。
        if (typeof window === 'undefined') {
            if (!serverRenderFallbackClient) {
                serverRenderFallbackClient = createServerRenderFallback()
            }
            return serverRenderFallbackClient
        }
        throw missingSupabaseEnvError()
    }

    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

    return browserClient
}
