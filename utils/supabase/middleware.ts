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

    // 刷新 session 并且获取用户信息
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 设置受保护的路由数组
    const protectedRoutes = ['/members', '/events']
    const isProtectedRoute = protectedRoutes.some(route => request.nextUrl.pathname.startsWith(route))

    if (!user && isProtectedRoute) {
        // 未登录且访问受保护路由，重定向到登录页
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 如果已经登录，且访问登录页，可以重定向到主页 (可选的 UX 提升)
    if (user && request.nextUrl.pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
