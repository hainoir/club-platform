"use client"

import * as React from "react"
import { Save, UserCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import type { ToastType } from "@/components/ui/toast-simple"
import type { AppUser } from "@/lib/app-user"
import { DEFAULT_MEMBER_ROLE } from "@/store/useUserStore"
import {
    DEPARTMENT_OPTIONS,
    GRADE_OPTIONS,
    normalizeDepartmentForStorage,
    normalizeGradeValue,
} from "@/utils/profile-fields"

import type { SettingsProfile, SettingsSupabaseClient } from "./settings-types"

interface ProfileTabProps {
    profile: SettingsProfile | null
    supabase: SettingsSupabaseClient
    currentUser: AppUser | null
    setUser: (user: AppUser | null) => void
    toast: (toast: Omit<ToastType, "id">) => void
}

export function ProfileTab({
    profile,
    supabase,
    currentUser,
    setUser,
    toast,
}: ProfileTabProps) {
    const [profileName, setProfileName] = React.useState(profile?.name || "")
    const [profileDepartment, setProfileDepartment] = React.useState(normalizeDepartmentForStorage(profile?.department))
    const [profileGrade, setProfileGrade] = React.useState(normalizeGradeValue(profile?.grade) || "")
    const [profileStudentId, setProfileStudentId] = React.useState(profile?.studentId || "")
    const [isSavingProfile, setIsSavingProfile] = React.useState(false)

    React.useEffect(() => {
        setProfileName(profile?.name || "")
        setProfileDepartment(normalizeDepartmentForStorage(profile?.department))
        setProfileGrade(normalizeGradeValue(profile?.grade) || "")
        setProfileStudentId(profile?.studentId || "")
    }, [profile])

    const onSaveProfile = async () => {
        if (!profile) {
            toast({ title: "无法保存", description: "未加载到账号信息，请刷新后重试。", variant: "destructive" })
            return
        }

        const safeName = profileName.trim()
        const safeStudentId = profileStudentId.trim()
        const safeDepartment = normalizeDepartmentForStorage(profileDepartment)
        const safeGrade = normalizeGradeValue(profileGrade)

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
                    department: safeDepartment,
                    grade: safeGrade || null,
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
                    role: profile.role || DEFAULT_MEMBER_ROLE,
                    department: safeDepartment,
                    grade: safeGrade || null,
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
                        department: safeDepartment,
                        grade: safeGrade || null,
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

    return (
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
                                    <Badge variant="outline">{profile.role || DEFAULT_MEMBER_ROLE}</Badge>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="profile-department">部门</Label>
                                <Select value={profileDepartment} onValueChange={setProfileDepartment}>
                                    <SelectTrigger id="profile-department">
                                        <SelectValue placeholder="选择部门" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="未分配">未分配</SelectItem>
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
    )
}
