import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    if (request.nextUrl.pathname === '/api/auth/session') {
        const passthrough = NextResponse.next({ request })
        passthrough.headers.set('Cache-Control', 'private, no-store')
        return passthrough
    }

    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
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

    // 【面试考点：会话刷新与令牌保活】
    // 调用鉴权接口不只是读取当前用户信息，底层还会自动检查访问令牌是否即将过期。
    // 若令牌已过期或即将过期，会自动使用刷新令牌换取新令牌并写入响应标记，实现无感刷新。
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 【面试考点：白名单机制与路由守卫】
    // 定义受保护的路由列表。只有经过身份验证的用户才能访问这些内部页面。
    // 相比在每个页面单独检查权限，在中间件中集中处理能在渲染前提前拦截请求，显著降低服务器开销。
    const pathname = request.nextUrl.pathname
    const isProtectedRoute =
        pathname === '/' ||
        pathname.startsWith('/duty') ||
        pathname.startsWith('/members') ||
        pathname.startsWith('/events') ||
        pathname.startsWith('/settings')

    if (!user && isProtectedRoute) {
        // 【面试考点：未授权访问拦截】
        // 如果用户未携带有效会话且试图访问受保护路由，我们直接将其重定向到登录页。
        // 使用地址克隆对象构建新地址，可确保重定向时保留原始主机和协议信息。
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 【面试考点：重定向与用户体验优化】
    // 当系统检测到用户已经拥有有效登录凭证，且正试图访问登录页（或其它开放入口页）时，
    // 我们会将其拦截并自动重定向回系统的首页或管理控制台，避免重复登录带来的疑惑，提升用户体验。
    if (user && pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        const redirectResponse = NextResponse.redirect(url)
        redirectResponse.headers.set('Cache-Control', 'private, no-store')
        return redirectResponse
    }

    supabaseResponse.headers.set('Cache-Control', 'private, no-store')
    return supabaseResponse
}

