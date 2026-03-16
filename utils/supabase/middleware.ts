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

    // 【面试考点：Session 刷新与令牌保活 (Token Refreshing)】
    // 调用 getUser() 不仅仅是获取当前用户信息。Supabase SDK 会在底层自动检查 access_token (访问令牌) 是否即将过期。
    // 如果过期或即将过期，它会自动使用 refresh_token 去请求一个新的 access_token 并写入 response 的 cookies 中，从而保持用户的持久登录状态，实现无感刷新。
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 【面试考点：白名单机制与路由守卫 (Route Guarding)】
    // 定义受保护的路由列表。只有经过身份验证的用户才能访问这些内部页面。
    // 相比于在每个页面组件单独检查权限，在 middleware.ts 中集中处理路由守卫是 Next.js 应用的标准最佳实践，可以在请求到达页面渲染之前就在 Edge Runtime (边缘计算环境) 中拦截，大幅降低服务器开销。
    const pathname = request.nextUrl.pathname
    const isProtectedRoute =
        pathname === '/' ||
        pathname.startsWith('/duty') ||
        pathname.startsWith('/members') ||
        pathname.startsWith('/events') ||
        pathname.startsWith('/settings')

    if (!user && isProtectedRoute) {
        // 【面试考点：未授权访问拦截】
        // 如果用户未携带有效的 Session 且试图访问受保护的路由，我们在此处直接将其重定向到 /login 登录页。
        // 通过 nextUrl.clone() 构建新的 URL 可以确保重定向时保留原始的 host 和协议信息。
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 【面试考点：重定向与 UX (用户体验) 优化】
    // 当系统检测到用户已经拥有有效的登录凭证，且他们正试图访问 /login （或其它开放性的注册/登录页）时，
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

