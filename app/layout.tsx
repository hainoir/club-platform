import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/components/ui/toast-simple"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { StoreHydration } from "@/components/providers/StoreHydration"
import { WebVitals } from "@/components/WebVitals"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
    title: "社团管理平台",
    description: "面向校园社团的全周期管理平台",
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="zh-CN" suppressHydrationWarning>
            <body className={inter.className}>
                <WebVitals />
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    <ToastProvider>
                        <StoreHydration />
                        <AuthProvider>{children}</AuthProvider>
                    </ToastProvider>
                </ThemeProvider>
            </body>
        </html>
    )
}
