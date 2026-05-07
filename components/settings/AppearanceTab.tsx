"use client"

import { Monitor } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import type { ToastType } from "@/components/ui/toast-simple"
import type { InterfacePreferences } from "@/store/usePreferencesStore"

import { PreferenceSwitch } from "./PreferenceSwitch"

interface AppearanceTabProps {
    theme: string | undefined
    setTheme: (theme: string) => void
    interfacePrefs: InterfacePreferences
    setInterfacePreference: <K extends keyof InterfacePreferences>(
        key: K,
        value: InterfacePreferences[K]
    ) => void
    resetPreferences: () => void
    toast: (toast: Omit<ToastType, "id">) => void
}

export function AppearanceTab({
    theme,
    setTheme,
    interfacePrefs,
    setInterfacePreference,
    resetPreferences,
    toast,
}: AppearanceTabProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Monitor className="h-5 w-5 text-primary" />
                    界面偏好
                </CardTitle>
                <CardDescription>调整显示密度与消息刷新行为。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>主题</Label>
                    <div className="flex gap-2">
                        <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")}>浅色</Button>
                        <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")}>深色</Button>
                        <Button variant={theme === "system" ? "default" : "outline"} onClick={() => setTheme("system")}>跟随系统</Button>
                    </div>
                </div>

                <PreferenceSwitch
                    label="紧凑模式"
                    description="减少间距，提高单屏信息密度。"
                    checked={interfacePrefs.compactMode}
                    onCheckedChange={(v) => setInterfacePreference("compactMode", v)}
                />

                <PreferenceSwitch
                    label="显示周进度卡"
                    description="关闭后仪表盘仅聚焦今日执行信息。"
                    checked={interfacePrefs.showWeeklyProgressOnDashboard}
                    onCheckedChange={(v) => setInterfacePreference("showWeeklyProgressOnDashboard", v)}
                />

                <div className="space-y-2">
                    <Label htmlFor="refresh">提醒自动刷新频率</Label>
                    <Select
                        value={String(interfacePrefs.autoRefreshSeconds)}
                        onValueChange={(value) => setInterfacePreference("autoRefreshSeconds", Number(value))}
                    >
                        <SelectTrigger id="refresh" className="w-full sm:w-56">
                            <SelectValue placeholder="选择刷新频率" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="15">15 秒</SelectItem>
                            <SelectItem value="30">30 秒</SelectItem>
                            <SelectItem value="60">60 秒</SelectItem>
                            <SelectItem value="120">120 秒</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="pt-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            resetPreferences()
                            toast({ title: "已恢复默认设置" })
                        }}
                    >
                        恢复默认偏好
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
