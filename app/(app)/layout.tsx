import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"

export default function AppLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen w-full bg-slate-50/50 dark:bg-zinc-950/50">
            <Sidebar className="hidden md:flex w-64 flex-col border-r bg-background/50 backdrop-blur-xl" />
            <div className="flex flex-col flex-1 relative w-full overflow-hidden shrink-0">
                <Header className="h-16 border-b shrink-0 bg-background/50 backdrop-blur-xl" />
                <main className="flex-1 w-full overflow-y-auto overflow-x-hidden relative p-4 md:p-8">{children}</main>
            </div>
        </div>
    )
}
