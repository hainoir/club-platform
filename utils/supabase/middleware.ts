import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient, User as SupabaseAuthUser } from '@supabase/supabase-js'
import { isAdminRole } from '@/lib/app-user'
import type { Database } from '@/types/supabase'

async function resolvePostLoginPath(
    supabase: SupabaseClient<Database>,
    user: SupabaseAuthUser
): Promise<'/' | '/duty'> {
    try {
        let role: string | null = null

        const byIdResult = await supabase
            .from('members')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()

        if (byIdResult.data?.role) {
            role = byIdResult.data.role
        }

        if (!role && user.email) {
            const byEmailResult = await supabase
                .from('members')
                .select('role, created_at')
                .ilike('email', user.email)
                .order('created_at', { ascending: false })
                .limit(20)

            const roles = (byEmailResult.data || []).map((member) => member.role).filter(Boolean)
            role = roles.find((value) => isAdminRole(value)) || roles[0] || null
        }

        return isAdminRole(role) ? '/duty' : '/'
    } catch {
        return '/'
    }
}

/**
 * 【学习注释：中间件里的统一会话收口】
 * 中间件是所有页面请求进入应用前最早经过的节点，适合集中处理 token 刷新和访问控制。
 * 这样页面本身就能更专注于渲染，不需要在每个入口都重复写一套登录判断。
 */
export async function updateSession(request: NextRequest) {
    if (request.nextUrl.pathname === '/api/auth/session') {
        const passthrough = NextResponse.next({ request })
        passthrough.headers.set('Cache-Control', 'private, no-store')
        return passthrough
    }

    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 【学习注释：借一次 getUser 完成 token 保活】
    // 这里不只是“取用户”，更重要的是让 Supabase 在请求入口就有机会刷新即将过期的会话。
    // 面试时可以强调：鉴权查询和令牌续期被集中放在中间件，减少了页面层的重复逻辑。
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 【学习注释：受保护路由判定】
    // 这里把“哪些页面必须登录”收敛成一处判断，后续如果新增后台页面，只需要扩展这份规则即可。
    const pathname = request.nextUrl.pathname
    const isProtectedRoute =
        pathname === '/' ||
        pathname.startsWith('/duty') ||
        pathname.startsWith('/members') ||
        pathname.startsWith('/events') ||
        pathname.startsWith('/settings')

    if (!user && isProtectedRoute) {
        // 【学习注释：未登录时的前置拦截】
        // 在进入页面渲染前直接重定向，能避免“先渲染半页内容再跳登录”的闪烁体验。
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 【学习注释：已登录用户不再回到登录页】
    // 这类跳转不只是“方便”，它还能保持登录后路径语义稳定，减少用户对当前身份状态的困惑。
    if (user && pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = await resolvePostLoginPath(supabase, user)
        const redirectResponse = NextResponse.redirect(url)
        redirectResponse.headers.set('Cache-Control', 'private, no-store')
        return redirectResponse
    }

    supabaseResponse.headers.set('Cache-Control', 'private, no-store')
    return supabaseResponse
}

