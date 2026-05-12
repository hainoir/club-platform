import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/components/ui/toast-simple"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { StoreHydration } from "@/components/providers/StoreHydration"
import { WebVitals } from "@/components/WebVitals"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

const inter = Inter({ subsets: ["latin"] })

/**
 * 【学习注释：根布局元信息】
 * App Router 允许在布局层直接导出元数据，让标题和描述在服务端渲染阶段就进入 HTML。
 * 面试里可以把这类配置归纳为“框架级搜索优化能力”，说明你知道页面结构和元信息应该放在最外层统一管理。
 */
export const metadata: Metadata = {
    title: "社团管理平台",
    description: "面向校园社团的全周期管理平台",
}

/**
 * 【学习注释：应用壳层与服务端/客户端边界】
 * RootLayout 默认是服务端组件，适合承载字体、全局样式和稳定的页面骨架。
 * 真正依赖浏览器能力的主题切换、提示消息、持久化状态恢复和登录态同步，
 * 通过下方的客户端 provider 组件接管，既保住首屏渲染收益，也让架构分层更清晰。
 */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="zh-CN" suppressHydrationWarning>
            <body className={inter.className}>
                <WebVitals />
                {/* 【学习注释：Provider 组合顺序】
                    ThemeProvider 先处理主题 class 和 hydration 差异；
                    ToastProvider 提供全局反馈通道；
                    StoreHydration 在客户端恢复持久化偏好；
                    AuthProvider 最后接管登录态同步，避免把整棵根布局都变成客户端组件。 */}
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    <ToastProvider>
                        <StoreHydration />
                        <AuthProvider>{children}</AuthProvider>
                    </ToastProvider>
                </ThemeProvider>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    )
}
