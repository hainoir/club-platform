"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast-simple"
import { usePreferencesStore } from "@/store/usePreferencesStore"
import { useUserStore } from "@/store/useUserStore"
import { createClient } from "@/utils/supabase/client"

import { AppearanceTab } from "./AppearanceTab"
import { NotificationTab } from "./NotificationTab"
import { ProfileTab } from "./ProfileTab"
import { SecurityTab } from "./SecurityTab"
import { TAB_VALUES, type SettingsProfile, type TabValue } from "./settings-types"

export type { SettingsProfile } from "./settings-types"

export default function SettingsClient({ profile }: { profile: SettingsProfile | null }) {
    const { theme, setTheme } = useTheme()
    const supabase = React.useMemo(() => createClient(), [])
    const { toast } = useToast()
    const currentUser = useUserStore((s) => s.user)
    const setUser = useUserStore((s) => s.setUser)

    const notifications = usePreferencesStore((s) => s.notifications)
    const interfacePrefs = usePreferencesStore((s) => s.interface)
    const setNotificationPreference = usePreferencesStore((s) => s.setNotificationPreference)
    const setInterfacePreference = usePreferencesStore((s) => s.setInterfacePreference)
    const resetPreferences = usePreferencesStore((s) => s.resetPreferences)

    const [activeTab, setActiveTab] = React.useState<TabValue>("notifications")

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
                        setNotificationPreference={setNotificationPreference}
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
