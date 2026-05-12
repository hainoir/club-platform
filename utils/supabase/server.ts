import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * 【学习注释：服务端 Supabase 客户端】
 * 服务端拿到的是当前请求的 cookies，因此可以在渲染页面前直接恢复会话、查询数据并返回首屏结果。
 * 和浏览器端不同，这里需要显式告诉 Supabase 如何读写 cookies，才能让会话刷新结果回写到响应里。
 */
export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // 【学习注释：服务端组件的写入限制】
                        // 某些调用场景只允许读取 cookies，不允许在当前渲染阶段回写；
                        // 这里选择静默吞掉，是因为读取用户态仍然有效，真正的刷新写回应交给中间件或路由处理。
                    }
                },
            },
        }
    )
}
