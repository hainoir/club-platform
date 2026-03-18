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
 * 【面试考点：客户端 Supabase 实例 (Client Component)】
 * 在 Next.js 中，带有 "use client" 的组件运行在用户的浏览器里。
 * 这个函数利用 @supabase/ssr 包创建了一个面向浏览器的客户端。
 * 它的秘钥 (NEXT_PUBLIC_...) 是对外公开的，因此只能进行配置了 RLS (行级安全策略) 的安全读写。
 */
export function createClient() {
    if (browserClient) return browserClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        // During build/prerender of Client Components, avoid crashing SSR output.
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
