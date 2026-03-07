import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * 【面试考点：服务端 Supabase 实例 (Server Component / API Route)】
 * 这个函数只能在 Next.js 的服务端环境（比如 page.tsx / route.ts / Server Actions）中运行。
 * 与 Browser Client 不同，它需要通过 next/headers 里的 cookies() 来手动管理用户的 Session 状态。
 * 服务端可以安全地访问数据库，因为代码不会暴露给前端浏览器。
 */
export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient(
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
                        // 如果在服务端组件中调用，设置 cookie 可能会失败，这是预期的
                    }
                },
            },
        }
    )
}