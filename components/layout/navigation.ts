import type { LucideIcon } from "lucide-react"
import { CalendarClock, CalendarDays, LayoutDashboard, Settings, Users } from "lucide-react"

export type AppNavigationItem = {
    name: string
    href: string
    icon: LucideIcon
}

export const appNavigation: AppNavigationItem[] = [
    { name: "我的工作台", href: "/", icon: LayoutDashboard },
    { name: "成员管理", href: "/members", icon: Users },
    { name: "活动中心", href: "/events", icon: CalendarDays },
    { name: "值班管理", href: "/duty", icon: CalendarClock },
    { name: "设置中心", href: "/settings", icon: Settings },
]
