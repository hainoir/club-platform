import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * 【学习注释：中间件匹配规则】
         * 中间件不应该拦截图片、静态资源和框架产物，否则每次加载资源都会多跑一遍鉴权逻辑。
         * 这里保留“页面请求进入鉴权链路，静态资源直接放行”的边界，是性能优化里很常见的一类细节。
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
