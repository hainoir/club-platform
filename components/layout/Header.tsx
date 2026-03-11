"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"
import { Bell, LogOut, Moon, Settings, Sun, User } from "lucide-react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"
import { NotificationLevel, useNotifications } from "@/hooks/useNotifications"

function getLevelClass(level: NotificationLevel): string {
    if (level === "critical") return "bg-destructive"
    if (level === "warning") return "bg-amber-500"
    return "bg-sky-500"
}

function formatRelativeTime(value: string): string {
    try {
        return formatDistanceToNow(new Date(value), { addSuffix: true, locale: zhCN })
    } catch {
        return "刚刚"
    }
}

export function Header({ className }: { className?: string }) {
    const { setTheme, theme } = useTheme()
    const router = useRouter()
    const supabase = React.useMemo(() => createClient(), [])
    const { user, logout } = useUserStore()

    const {
        notifications,
        loading,
        unreadCount,
        hasUnread,
        markAsRead,
        markAllAsRead,
        isRead,
        refresh,
        markReadOnOpen,
    } = useNotifications()

    const handleLogout = async () => {
        await supabase.auth.signOut()
        logout()
        router.push("/login")
    }

    return (
        <header className={cn("flex items-center justify-between px-6 z-10", className)}>
            <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight hidden sm:block">欢迎回来，{user?.name || "成员"}</h2>
            </div>

            <div className="flex items-center gap-3">
                <DropdownMenu
                    onOpenChange={(open) => {
                        if (!open) return
                        refresh()
                        if (markReadOnOpen) {
                            markAllAsRead()
                        }
                    }}
                >
                    <DropdownMenuTrigger asChild>
                        <Button data-testid="notification-trigger" variant="ghost" size="icon" className="rounded-full relative">
                            <Bell className="h-5 w-5" />
                            {hasUnread && (
                                <>
                                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
                                    <span className="absolute -right-1 -top-1 rounded-full bg-destructive text-[10px] text-destructive-foreground px-1 min-w-4 h-4 leading-4 text-center">
                                        {unreadCount > 9 ? "9+" : unreadCount}
                                    </span>
                                </>
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[26rem]" align="end">
                        <DropdownMenuLabel className="flex items-center justify-between">
                            <span>消息提醒</span>
                            {notifications.length > 0 && (
                                <button
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        markAllAsRead()
                                    }}
                                >
                                    全部标记为已读
                                </button>
                            )}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        {loading ? (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">正在加载提醒...</div>
                        ) : notifications.length === 0 ? (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">暂无待处理提醒</div>
                        ) : (
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.map((n) => {
                                    const read = isRead(n.id)
                                    return (
                                        <DropdownMenuItem
                                            key={n.id}
                                            data-testid="notification-item"
                                            data-level={n.level}
                                            className={cn("items-start py-2 cursor-pointer", !read && "bg-muted/40")}
                                            onSelect={(e) => {
                                                e.preventDefault()
                                                markAsRead(n.id)
                                                if (n.href) {
                                                    router.push(n.href)
                                                }
                                            }}
                                        >
                                            <div className="space-y-1 w-full">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className={cn("h-2 w-2 rounded-full shrink-0", getLevelClass(n.level))} />
                                                        <p className="text-sm font-medium leading-5 truncate">{n.title}</p>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground shrink-0">{formatRelativeTime(n.createdAt)}</p>
                                                </div>
                                                <p className="text-xs text-muted-foreground leading-5">{n.description}</p>
                                            </div>
                                        </DropdownMenuItem>
                                    )
                                })}
                            </div>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault()
                                router.push("/settings#notifications")
                            }}
                        >
                            <Settings className="mr-2 h-4 w-4" />
                            <span>通知设置</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                >
                    <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">切换主题</span>
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="relative h-9 w-9 rounded-full border bg-muted focus-visible:ring-0">
                            <User className="h-5 w-5 text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{user?.name || "用户"}</p>
                                <p className="text-xs leading-none text-muted-foreground">{user?.email || "未绑定邮箱"}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={(e) => {
                                e.preventDefault()
                                router.push("/settings")
                            }}
                        >
                            <Settings className="mr-2 h-4 w-4" />
                            <span>设置</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={handleLogout}
                            className="text-destructive focus:bg-destructive focus:text-destructive-foreground cursor-pointer"
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>退出登录</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    )
}
