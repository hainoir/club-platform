"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, CalendarDays, Code2, CalendarClock } from "lucide-react"
import { cn } from "@/lib/utils"

const navigation = [
    { name: '仪表盘', href: '/', icon: LayoutDashboard },
    { name: '成员管理', href: '/members', icon: Users },
    { name: '活动与课程', href: '/events', icon: CalendarDays },
    { name: '值班大厅', href: '/duty', icon: CalendarClock },
]

export function Sidebar({ className }: { className?: string }) {
    const pathname = usePathname()

    return (
        <div className={cn("hidden md:flex flex-col gap-4 py-4 pt-10", className)}>
            <div className="px-6 flex items-center gap-2 mb-8">
                <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md">
                    <Code2 size={20} />
                </div>
                <span className="font-bold text-lg tracking-tight">前端俱乐部</span>
            </div>
            <nav className="flex-1 px-4 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all",
                                isActive
                                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                                    : "text-muted-foreground hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                            )}
                        >
                            <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-muted-foreground")} />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
