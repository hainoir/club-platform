import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * 【面试考点：服务端数据库实例】
 * 这个函数只能在服务端环境中运行（例如页面路由文件或服务端动作）。
 * 与浏览器端实例不同，这里需要手动读取并写入会话标记来管理登录状态。
 * 服务端可以安全访问数据库，因为这部分代码不会暴露给前端浏览器。
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
                        // 如果在服务端组件中调用，写入会话标记可能失败，这是预期行为
                    }
                },
            },
        }
    )
}
