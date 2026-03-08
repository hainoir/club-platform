import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/components/ui/toast-simple"
import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { AuthProvider } from "@/components/providers/AuthProvider"
import { WebVitals } from "@/components/WebVitals"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
    title: "前端俱乐部平台",
    description: "面向开发者的俱乐部管理平台",
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className}>
                <WebVitals />
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    <ToastProvider>
                        <AuthProvider>
                            <div className="flex min-h-screen w-full bg-slate-50/50 dark:bg-zinc-950/50">
                                <Sidebar className="hidden md:flex w-64 flex-col border-r bg-background/50 backdrop-blur-xl" />
                                <div className="flex flex-col flex-1 relative w-full overflow-hidden shrink-0">
                                    <Header className="h-16 border-b shrink-0 bg-background/50 backdrop-blur-xl" />
                                    <main className="flex-1 w-full overflow-y-auto overflow-x-hidden relative p-4 md:p-8">
                                        {children}
                                    </main>
                                </div>
                            </div>
                        </AuthProvider>
                    </ToastProvider>
                </ThemeProvider>
            </body>
        </html>
    )
}
