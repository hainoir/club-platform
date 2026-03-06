"use client"
import { useTheme } from "next-themes"
import { Moon, Sun, Bell, TerminalSquare, User, LogOut, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function Header({ className }: { className?: string }) {
    const { setTheme, theme } = useTheme()

    return (
        <header className={cn("flex items-center justify-between px-6 z-10", className)}>
            <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight hidden sm:block">欢迎回来，管理员 👋</h2>
            </div>

            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="rounded-full relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-destructive" />
                </Button>
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
                        <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-2 border bg-muted focus-visible:ring-0">
                            <User className="h-5 w-5 text-muted-foreground" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">管理员</p>
                                <p className="text-xs leading-none text-muted-foreground">admin@frontendclub.com</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>设置</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <TerminalSquare className="mr-2 h-4 w-4" />
                            <span>开发者面板</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:bg-destructive focus:text-destructive-foreground">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>退出登录</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    )
}
