import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
    return await updateSession(request)
}

export const config = {
    matcher: [
        /*
         * 【系统学习：中间件路由匹配器】
         * 匹配所有前端导航和接口请求路径，但会排除以下静态资源：
         * - 框架静态资源目录
         * - 框架图片优化目录
         * - 站点图标资源
         * - 以及常见图片扩展名对应的静态资源请求
         * 这样能显著降低鉴权拦截器误处理带来的性能开销。
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
