"use client"

import * as React from "react"
import { Eye, KeyRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ToastType } from "@/components/ui/toast-simple"

import type { SettingsSupabaseClient } from "./settings-types"

interface SecurityTabProps {
    supabase: SettingsSupabaseClient
    toast: (toast: Omit<ToastType, "id">) => void
}

export function SecurityTab({ supabase, toast }: SecurityTabProps) {
    const [newPassword, setNewPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false)

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
    )
}
