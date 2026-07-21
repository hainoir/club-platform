"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSupabase } from "@/hooks/shared/useSupabase"
import { useToast } from "@/components/ui/toast-simple"
import { usePreferencesStore } from "@/store/usePreferencesStore"
import { useUserStore } from "@/store/useUserStore"
import { usePushNotifications } from "@/hooks/push/usePushNotifications"

import { AppearanceTab } from "./AppearanceTab"
import { NotificationTab } from "./NotificationTab"
import { ProfileTab } from "./ProfileTab"
import { SecurityTab } from "./SecurityTab"
import { TAB_VALUES, type SettingsProfile, type TabValue } from "./settings-types"

export type { SettingsProfile } from "./settings-types"

export default function SettingsClient({ profile }: { profile: SettingsProfile | null }) {
    const { theme, setTheme } = useTheme()
    const supabase = useSupabase()
    const { toast } = useToast()
    const currentUser = useUserStore((s) => s.user)
    const setUser = useUserStore((s) => s.setUser)

    const notifications = usePreferencesStore((s) => s.notifications)
    const interfacePrefs = usePreferencesStore((s) => s.interface)
    const setNotificationPreference = usePreferencesStore((s) => s.setNotificationPreference)
    const setInterfacePreference = usePreferencesStore((s) => s.setInterfacePreference)
    const resetPreferences = usePreferencesStore((s) => s.resetPreferences)
    const pushController = usePushNotifications()

    const [activeTab, setActiveTab] = React.useState<TabValue>("notifications")

    React.useEffect(() => {
        if (!pushController.hasServerPreferences) return
        const server = pushController.deviceStatus.preferences
        const nextValues = {
            inAppEnabled: server.inAppEnabled,
            dutyReminder: server.dutyReminder,
            keyTransferReminder: server.keyTransferReminder,
            leaveReminder: server.leaveReminder,
            swapReminder: server.swapReminder,
            eventReminder: server.eventReminder,
        }
        for (const [key, value] of Object.entries(nextValues)) {
            const typedKey = key as keyof typeof nextValues
            if (notifications[typedKey] !== value) {
                setNotificationPreference(typedKey, value)
            }
        }
    }, [notifications, pushController.deviceStatus.preferences, pushController.hasServerPreferences, setNotificationPreference])

    const updateNotificationPreference = <K extends keyof typeof notifications>(key: K, value: (typeof notifications)[K]) => {
        setNotificationPreference(key, value)
        if (key === "markReadOnOpen") return

        const next = { ...notifications, [key]: value }
        void pushController.savePreferences({
            inAppEnabled: next.inAppEnabled,
            dutyReminder: next.dutyReminder,
            keyTransferReminder: next.keyTransferReminder,
            leaveReminder: next.leaveReminder,
            swapReminder: next.swapReminder,
            eventReminder: next.eventReminder,
        }).then((saved) => {
            if (!saved) {
                toast({ title: "通知偏好保存失败", description: "本机设置已更新，但服务端同步失败。", variant: "destructive" })
            }
        })
    }

    React.useEffect(() => {
        if (typeof window === "undefined") return

        const syncFromHash = () => {
            const hash = window.location.hash.replace("#", "") as TabValue
            if (TAB_VALUES.includes(hash)) {
                setActiveTab(hash)
            }
        }

        syncFromHash()
        window.addEventListener("hashchange", syncFromHash)
        return () => window.removeEventListener("hashchange", syncFromHash)
    }, [])

    const onTabChange = (value: string) => {
        const nextTab = value as TabValue
        setActiveTab(nextTab)

        if (typeof window !== "undefined") {
            window.history.replaceState(null, "", `/settings#${nextTab}`)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">设置中心</h2>
                <p className="text-sm text-muted-foreground mt-1">集中管理通知提醒、界面偏好、账号资料与安全选项。</p>
            </div>

            <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
                    <TabsTrigger value="notifications" id="notifications">通知提醒</TabsTrigger>
                    <TabsTrigger value="interface">界面偏好</TabsTrigger>
                    <TabsTrigger value="account">账号资料</TabsTrigger>
                    <TabsTrigger value="security">安全设置</TabsTrigger>
                </TabsList>

                <TabsContent value="notifications" className="space-y-4">
                    <NotificationTab
                        notifications={notifications}
                        setNotificationPreference={updateNotificationPreference}
                        pushController={pushController}
                    />
                </TabsContent>

                <TabsContent value="interface" className="space-y-4">
                    <AppearanceTab
                        theme={theme}
                        setTheme={setTheme}
                        interfacePrefs={interfacePrefs}
                        setInterfacePreference={setInterfacePreference}
                        resetPreferences={resetPreferences}
                        toast={toast}
                    />
                </TabsContent>

                <TabsContent value="account" className="space-y-4">
                    <ProfileTab
                        profile={profile}
                        supabase={supabase}
                        currentUser={currentUser}
                        setUser={setUser}
                        toast={toast}
                    />
                </TabsContent>

                <TabsContent value="security" className="space-y-4">
                    <SecurityTab supabase={supabase} toast={toast} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
