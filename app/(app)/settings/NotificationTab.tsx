"use client"

import { Bell } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { NotificationPreferences } from "@/store/usePreferencesStore"

import { PreferenceSwitch } from "./PreferenceSwitch"

interface NotificationTabProps {
    notifications: NotificationPreferences
    setNotificationPreference: <K extends keyof NotificationPreferences>(
        key: K,
        value: NotificationPreferences[K]
    ) => void
}

export function NotificationTab({
    notifications,
    setNotificationPreference,
}: NotificationTabProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Bell className="h-5 w-5 text-primary" />
                    消息提醒
                </CardTitle>
                <CardDescription>控制顶部消息铃铛中显示哪些提醒。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <PreferenceSwitch
                    label="值班提醒"
                    description="即将开始值班、代班状态变化、逾期未签到提醒。"
                    checked={notifications.dutyReminder}
                    onCheckedChange={(v) => setNotificationPreference("dutyReminder", v)}
                />
                <PreferenceSwitch
                    label="钥匙交接提醒"
                    description="包含你收到或发出的钥匙交接待确认消息。"
                    checked={notifications.keyTransferReminder}
                    onCheckedChange={(v) => setNotificationPreference("keyTransferReminder", v)}
                />
                <PreferenceSwitch
                    label="活动提醒"
                    description="仅提醒你已报名且 72 小时内开始的活动。"
                    checked={notifications.eventReminder}
                    onCheckedChange={(v) => setNotificationPreference("eventReminder", v)}
                />
                <PreferenceSwitch
                    label="打开面板即已读"
                    description="打开消息面板后自动将全部提醒标记为已读。"
                    checked={notifications.markReadOnOpen}
                    onCheckedChange={(v) => setNotificationPreference("markReadOnOpen", v)}
                />
            </CardContent>
        </Card>
    )
}
