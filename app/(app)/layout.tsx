import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { AppRouteGuard } from "@/components/providers/AppRouteGuard"
import { createClient } from "@/utils/supabase/server"
import { resolveAppUser } from "@/utils/supabase/resolve-app-user"

export const dynamic = "force-dynamic"

/**
 * 【学习注释：受保护业务壳层】
 * 这个布局只包裹登录后的业务页面，所以它会在服务端先解析当前用户，再把结果交给客户端的 route guard。
 * 这样做的好处是：首屏就知道用户身份，侧边栏和头部可以直接拿到正确状态，避免先闪空壳再跳转。
 */
export default async function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser()

    // 【学习注释：首屏用户注入】
    // 这里把 Supabase 的 auth user 进一步映射成业务层 AppUser，
    // 目的是在进入客户端之前就统一好角色、姓名等展示需要的数据形状。
    const initialUser = await resolveAppUser(supabase, authUser)

    return (
        <AppRouteGuard initialUser={initialUser}>
            <div className="flex min-h-screen w-full bg-slate-50/50 dark:bg-zinc-950/50">
                <Sidebar className="hidden md:flex w-64 flex-col border-r bg-background/50 backdrop-blur-xl" />
                <div className="flex flex-col flex-1 relative w-full overflow-hidden shrink-0">
                    <Header className="h-16 border-b shrink-0 bg-background/50 backdrop-blur-xl" />
                    <main className="flex-1 w-full overflow-y-auto overflow-x-hidden relative p-4 md:p-8">{children}</main>
                </div>
            </div>
        </AppRouteGuard>
    )
}
