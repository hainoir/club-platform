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

// 【面试考点：搜索优化与元信息标签动态管理】
// 在框架路由体系中，通过导出元信息对象（或动态元信息函数），
// 可以在服务端渲染阶段动态注入页面头部标签，这是服务端渲染方案在搜索优化上的核心优势之一。
export const metadata: Metadata = {
    title: "社团管理平台",
    description: "面向校园社团的全周期管理平台",
}

// 【面试考点：根级服务端组件与水合】
// 根布局是应用最外层组件，默认以服务端组件方式运行。
// 忽略水合警告开关很关键，因为主题库会在客户端动态修改页面根标签的样式属性，
// 这会导致前后端渲染属性不一致并触发水合不匹配报错。
export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="zh-CN" suppressHydrationWarning>
            <body className={inter.className}>
                <WebVitals />
                {/* 【面试考点：上下文注入与状态隔离】
                    将主题、通知和鉴权等全局状态作为上下文包裹在根节点。
                    这种模式在保证全局状态可用的同时，通过按需拆分客户端组件（如 `AuthProvider`）
                    将其与外层服务端组件边界清晰隔离，最大化服务端渲染收益。 */}
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
