import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/components/ui/toast-simple"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { StoreHydration } from "@/components/providers/StoreHydration"
import { WebVitals } from "@/components/WebVitals"
import { Analytics } from "@vercel/analytics/next"

const inter = Inter({ subsets: ["latin"] })

// 【面试考点：SEO 与 Meta 标签动态管理】
// 在 Next.js App Router 中，通过导出一个名为 metadata 的对象（或 generateMetadata 函数），
// 可以在服务端渲染阶段动态注入 `<head>` 标签，这是 Next.js 优于传统 SPA 的核心 SEO 特性之一。
export const metadata: Metadata = {
    title: "社团管理平台",
    description: "面向校园社团的全周期管理平台",
}

// 【面试考点：根级 Server Component 与 Hydration】
// RootLayout 是应用的最外层组件。默认情况下它是 React Server Component (RSC)。
// suppressHydrationWarning 是必要的，因为例如 next-themes 会在客户端动态修改 html 标签的 class/style，
// 这会导致 React 前后端渲染结点的属性不一致（Hydration Mismatch 报错）。
export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="zh-CN" suppressHydrationWarning>
            <body className={inter.className}>
                <WebVitals />
                {/* 【面试考点：Provider 注入与状态隔离】
                    将主题、Toaster 和 Auth 等全局状态作为上下文 (Context) 包裹在根节点。
                    这种模式在保证全局状态可用的同时，通过按需拆分 Client Components (如 AuthProvider) 
                    将其与外层的 Server Component 边界明确隔离开来，最大化服务端的渲染效益。 */}
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    <ToastProvider>
                        <StoreHydration />
                        <AuthProvider>{children}</AuthProvider>
                    </ToastProvider>
                </ThemeProvider>
                <Analytics />
            </body>
        </html>
    )
}
