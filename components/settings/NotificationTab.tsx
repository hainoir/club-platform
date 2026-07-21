"use client"

import { Bell } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { NotificationPreferences } from "@/store/usePreferencesStore"
import type { PushNotificationsController } from "@/hooks/push/usePushNotifications"

import { PreferenceSwitch } from "./PreferenceSwitch"
import { PushNotificationCard } from "./PushNotificationCard"

interface NotificationTabProps {
    notifications: NotificationPreferences
    setNotificationPreference: <K extends keyof NotificationPreferences>(
        key: K,
        value: NotificationPreferences[K]
    ) => void
    pushController: PushNotificationsController
}

export function NotificationTab({
    notifications,
    setNotificationPreference,
    pushController,
}: NotificationTabProps) {
    return (
        <div className="space-y-4">
            <PushNotificationCard controller={pushController} />
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Bell className="h-5 w-5 text-primary" />
                        消息提醒
                    </CardTitle>
                    <CardDescription>业务分类同时用于站内铃铛和已开启的手机通知；活动提醒第一版仅在站内展示。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                <PreferenceSwitch
                    label="站内消息铃铛"
                    description="关闭后顶部铃铛不再查询业务提醒，不影响已开启的手机系统通知。"
                    checked={notifications.inAppEnabled}
                    onCheckedChange={(v) => setNotificationPreference("inAppEnabled", v)}
                />
                <PreferenceSwitch
                    label="值班提醒"
                    description="即将开始值班、代班状态变化、逾期未签到提醒。"
                    checked={notifications.dutyReminder}
                    onCheckedChange={(v) => setNotificationPreference("dutyReminder", v)}
                />
                <PreferenceSwitch
                    label="请假审批提醒"
                    description="包含纯请假待审批和请假批准结果。"
                    checked={notifications.leaveReminder}
                    onCheckedChange={(v) => setNotificationPreference("leaveReminder", v)}
                />
                <PreferenceSwitch
                    label="代班提醒"
                    description="包含定向邀请、接单、待审批和批准结果。"
                    checked={notifications.swapReminder}
                    onCheckedChange={(v) => setNotificationPreference("swapReminder", v)}
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
        </div>
    )
}
