"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Bell, Eye, KeyRound, Monitor, Save, UserCircle2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast-simple"
import { createClient } from "@/utils/supabase/client"
import { usePreferencesStore } from "@/store/usePreferencesStore"
import { useUserStore } from "@/store/useUserStore"

export interface SettingsProfile {
    id: string
    email: string
    name: string
    role: string
    department: string | null
    grade: string | null
    studentId: string | null
}

const TAB_VALUES = ["notifications", "interface", "account", "security"] as const

type TabValue = (typeof TAB_VALUES)[number]

const DEPARTMENT_OPTIONS = [
    { value: "Design", label: "设计部" },
    { value: "Development", label: "开发部" },
    { value: "Photography", label: "摄影部" },
]

const GRADE_OPTIONS = [
    { value: "Freshman", label: "大一" },
    { value: "Sophomore", label: "大二" },
    { value: "Junior", label: "大三" },
    { value: "Senior", label: "大四" },
]

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

    const [profileName, setProfileName] = React.useState(profile?.name || "")
    const [profileDepartment, setProfileDepartment] = React.useState(profile?.department || "")
    const [profileGrade, setProfileGrade] = React.useState(profile?.grade || "")
    const [profileStudentId, setProfileStudentId] = React.useState(profile?.studentId || "")
    const [isSavingProfile, setIsSavingProfile] = React.useState(false)

    const [newPassword, setNewPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false)

    React.useEffect(() => {
        setProfileName(profile?.name || "")
        setProfileDepartment(profile?.department || "")
        setProfileGrade(profile?.grade || "")
        setProfileStudentId(profile?.studentId || "")
    }, [profile])

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

    const onSaveProfile = async () => {
        if (!profile) {
            toast({ title: "无法保存", description: "未加载到账号信息，请刷新后重试。", variant: "destructive" })
            return
        }

        const safeName = profileName.trim()
        const safeStudentId = profileStudentId.trim()

        if (safeName.length < 2) {
            toast({ title: "姓名过短", description: "姓名至少需要 2 个字符。", variant: "destructive" })
            return
        }

        if (safeStudentId && !/^\d{4,18}$/.test(safeStudentId)) {
            toast({ title: "学号格式错误", description: "学号需为 4-18 位数字。", variant: "destructive" })
            return
        }

        setIsSavingProfile(true)
        try {
            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    name: safeName,
                    department: profileDepartment || null,
                    grade: profileGrade || null,
                    student_id: safeStudentId || null,
                },
            })

            if (authError) throw authError

            let memberSyncWarning = false
            const { data: existingMember, error: lookupError } = await supabase
                .from("members")
                .select("id")
                .eq("id", profile.id)
                .maybeSingle()

            if (lookupError && lookupError.code !== "PGRST116") {
                throw lookupError
            }

            if (!existingMember) {
                const { error: insertError } = await supabase.from("members").insert({
                    id: profile.id,
                    email: profile.email,
                    name: safeName,
                    role: profile.role || "member",
                    department: profileDepartment || null,
                    grade: profileGrade || null,
                    student_id: safeStudentId || null,
                    status: "active",
                    join_date: new Date().toISOString().slice(0, 10),
                })

                if (insertError) {
                    memberSyncWarning = true
                }
            } else {
                const { error: updateError } = await supabase
                    .from("members")
                    .update({
                        name: safeName,
                        department: profileDepartment || null,
                        grade: profileGrade || null,
                        student_id: safeStudentId || null,
                    })
                    .eq("id", profile.id)

                if (updateError) {
                    memberSyncWarning = true
                }
            }

            if (currentUser) {
                setUser({ ...currentUser, name: safeName })
            }

            toast({
                title: "资料已保存",
                description: memberSyncWarning
                    ? "账号资料已更新；成员表同步受权限限制，已保留你本次修改。"
                    : "账号资料与成员信息已同步更新。",
            })
        } catch (error: unknown) {
            toast({
                title: "保存失败",
                description: (error as Error).message || "暂时无法保存资料，请稍后重试。",
                variant: "destructive",
            })
        } finally {
            setIsSavingProfile(false)
        }
    }

    const onSavePassword = async () => {
        if (newPassword.length < 8) {
            toast({ title: "密码过短", description: "请至少输入 8 位密码。", variant: "destructive" })
            return
        }

        if (newPassword !== confirmPassword) {
            toast({ title: "两次密码不一致", description: "请重新确认新密码。", variant: "destructive" })
            return
        }

        setIsUpdatingPassword(true)
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword })
            if (error) throw error

            setNewPassword("")
            setConfirmPassword("")
            toast({ title: "密码已更新", description: "下次登录请使用新密码。" })
        } catch (error: unknown) {
            toast({
                title: "更新失败",
                description: (error as Error).message || "暂时无法更新密码，请稍后再试。",
                variant: "destructive",
            })
        } finally {
            setIsUpdatingPassword(false)
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
                </TabsContent>

                <TabsContent value="interface" className="space-y-4">
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
                </TabsContent>

                <TabsContent value="account" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <UserCircle2 className="h-5 w-5 text-primary" />
                                账号资料
                            </CardTitle>
                            <CardDescription>更新你的姓名、部门、年级和学号信息。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {profile ? (
                                <>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="profile-name">姓名</Label>
                                            <Input
                                                id="profile-name"
                                                value={profileName}
                                                onChange={(e) => setProfileName(e.target.value)}
                                                placeholder="请输入姓名"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="profile-email">邮箱</Label>
                                            <Input id="profile-email" value={profile.email} disabled />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>角色</Label>
                                            <div>
                                                <Badge variant="outline">{profile.role || "member"}</Badge>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="profile-department">部门</Label>
                                            <Select value={profileDepartment || "unset"} onValueChange={(v) => setProfileDepartment(v === "unset" ? "" : v)}>
                                                <SelectTrigger id="profile-department">
                                                    <SelectValue placeholder="选择部门" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="unset">未设置</SelectItem>
                                                    {DEPARTMENT_OPTIONS.map((item) => (
                                                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="profile-grade">年级</Label>
                                            <Select value={profileGrade || "unset"} onValueChange={(v) => setProfileGrade(v === "unset" ? "" : v)}>
                                                <SelectTrigger id="profile-grade">
                                                    <SelectValue placeholder="选择年级" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="unset">未设置</SelectItem>
                                                    {GRADE_OPTIONS.map((item) => (
                                                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="profile-student-id">学号</Label>
                                            <Input
                                                id="profile-student-id"
                                                value={profileStudentId}
                                                onChange={(e) => setProfileStudentId(e.target.value.replace(/\s/g, ""))}
                                                placeholder="例如：20240001"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-xs text-muted-foreground">
                                            保存后会同步到账号元数据；若成员表权限受限，将保留本地账号侧修改。
                                        </p>
                                        <Button onClick={onSaveProfile} disabled={isSavingProfile} className="gap-2 shrink-0">
                                            <Save className="h-4 w-4" />
                                            {isSavingProfile ? "保存中..." : "保存资料"}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">未加载到账号资料，请刷新页面后重试。</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="security" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <KeyRound className="h-5 w-5 text-primary" />
                                安全设置
                            </CardTitle>
                            <CardDescription>修改当前账号密码。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 max-w-md">
                            <div className="space-y-2">
                                <Label htmlFor="new-password">新密码</Label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="至少 8 位"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirm-password">确认新密码</Label>
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>

                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                推荐使用字母 + 数字 + 特殊字符组合。
                            </p>

                            <Button onClick={onSavePassword} disabled={isUpdatingPassword}>
                                {isUpdatingPassword ? "更新中..." : "更新密码"}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}

function PreferenceSwitch({
    label,
    description,
    checked,
    onCheckedChange,
}: {
    label: string
    description: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    )
}
