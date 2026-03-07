import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

/**
 * 【面试考点：客户端 Supabase 实例 (Client Component)】
 * 在 Next.js 中，带有 "use client" 的组件运行在用户的浏览器里。
 * 这个函数利用 @supabase/ssr 包创建了一个面向浏览器的客户端。
 * 它的秘钥 (NEXT_PUBLIC_...) 是对外公开的，因此只能进行配置了 RLS (行级安全策略) 的安全读写。
 */
export function createClient() {
    return createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
}