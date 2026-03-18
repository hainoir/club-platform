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
 * 【面试考点：浏览器端数据库实例】
 * 在本项目中，带有客户端指令的组件运行在用户浏览器里。
 * 这个函数通过浏览器适配库创建数据库客户端实例。
 * 它使用公开环境变量，因此只能配合行级权限策略进行安全读写。
 */
export function createClient() {
    if (browserClient) return browserClient

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        // 在构建或预渲染浏览器端组件时，避免让服务端渲染结果直接崩溃。
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
