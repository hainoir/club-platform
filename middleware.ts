import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * 【系统学习：中间件路由匹配器 (Matcher)】
         * 匹配所有的前端导航和 API 请求路径，但在经过中间件时，过滤排除掉以下静态资源：
         * - _next/static (编译后的 JS/CSS)
         * - _next/image (NextJS 图片优化模块)
         * - favicon.ico (网页图标)
         * - 以及所有形如 .svg, .png... 的静态图片资源请求
         * 这样能极大减轻被鉴权系统拦截器误伤的性能开销。
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
