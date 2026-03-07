import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
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

    // 【系统学习：Session 刷新与令牌保活】
    // 调用 getUser() 不仅仅是拿信息，它会在背后检查如果 access_token 快过期了，
    // 就自动用 refresh_token 去换一个新令牌写入 request.cookies，保持用户的登录态持久有效。
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 【系统学习：路由守卫 (Route Guarding)】
    // 定义只有内部人员可见的前端页面数组。
    const protectedRoutes = ['/members', '/events']
    const isProtectedRoute = protectedRoutes.some(route => request.nextUrl.pathname.startsWith(route))

    if (!user && isProtectedRoute) {
        // 【系统学习：未授权拦截与踢出】
        // 没带合法 Cookie 也敢进门？把你强制遣返到 /login 登录前台。
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 【系统学习：UX 重定向优化】
    // 当系统检测到硬盘里有合法的登录凭证时，拦截用户再去硬闯 /login 的行为，将老玩家直接送回管理大厅。
    if (user && request.nextUrl.pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
