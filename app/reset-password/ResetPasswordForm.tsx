"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/toast-simple"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PASSWORD_RULE = /(?=.*[A-Za-z])(?=.*\d).{8,}/

function clearRecoveryParamsFromUrl() {
    if (typeof window === "undefined") return

    const url = new URL(window.location.href)
    const removeKeys = ["code", "token_hash", "type", "access_token", "refresh_token", "expires_in", "expires_at"]
    let hasChanged = false

    for (const key of removeKeys) {
        if (url.searchParams.has(key)) {
            url.searchParams.delete(key)
            hasChanged = true
        }
    }

    if (url.hash.includes("access_token") || url.hash.includes("refresh_token") || url.hash.includes("type=recovery")) {
        url.hash = ""
        hasChanged = true
    }

    if (hasChanged) {
        const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}`
        window.history.replaceState(null, "", next)
    }
}

export default function ResetPasswordForm() {
    const router = useRouter()
    const supabase = React.useMemo(() => createClient(), [])
    const { toast } = useToast()

    const [newPassword, setNewPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isCheckingLink, setIsCheckingLink] = React.useState(true)
    const [isRecoveryReady, setIsRecoveryReady] = React.useState(false)
    const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false)
    const [recoveryError, setRecoveryError] = React.useState<string | null>(null)

    React.useEffect(() => {
        let active = true

        const applyRecoverySession = async () => {
            try {
                const url = new URL(window.location.href)
                const code = url.searchParams.get("code")
                const tokenHash = url.searchParams.get("token_hash")
                const type = url.searchParams.get("type")

                if (code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(code)
                    if (error) throw error
                } else if (tokenHash && type === "recovery") {
                    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
                    if (error) throw error
                }

                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession()

                if (sessionError) throw sessionError
                if (!session) throw new Error("重置链接无效或已过期，请重新申请。")

                if (!active) return
                setIsRecoveryReady(true)
                setRecoveryError(null)
                clearRecoveryParamsFromUrl()
            } catch (error: unknown) {
                if (!active) return
                setIsRecoveryReady(false)
                setRecoveryError((error as Error).message || "重置链接无效或已过期，请重新申请。")
            } finally {
                if (active) {
                    setIsCheckingLink(false)
                }
            }
        }

        void applyRecoverySession()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (!active) return

            if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
                setIsRecoveryReady(!!session)
                if (session) {
                    setRecoveryError(null)
                    clearRecoveryParamsFromUrl()
                }
                setIsCheckingLink(false)
            }
        })

        return () => {
            active = false
            subscription.unsubscribe()
        }
    }, [supabase])

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!isRecoveryReady) {
            toast({ title: "链接失效", description: "请从登录页重新发送重置邮件。", variant: "destructive" })
            return
        }

        if (newPassword.length < 8) {
            toast({ title: "密码过短", description: "请至少输入 8 位密码。", variant: "destructive" })
            return
        }

        if (!PASSWORD_RULE.test(newPassword)) {
            toast({ title: "密码过弱", description: "密码需至少包含字母和数字。", variant: "destructive" })
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

            await supabase.auth.signOut()

            toast({ title: "密码已重置", description: "请使用新密码重新登录。" })
            router.replace("/login")
            router.refresh()
        } catch (error: unknown) {
            toast({
                title: "重置失败",
                description: (error as Error).message || "暂时无法更新密码，请稍后重试。",
                variant: "destructive",
            })
        } finally {
            setIsUpdatingPassword(false)
        }
    }

    if (isCheckingLink) {
        return (
            <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm sm:border">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在校验重置链接...
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (!isRecoveryReady) {
        return (
            <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm sm:border">
                <CardContent className="pt-6 space-y-4">
                    <p className="text-sm text-destructive">{recoveryError || "重置链接无效或已过期。"}</p>
                    <Button asChild className="w-full">
                        <Link href="/login">返回登录页重新申请</Link>
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm sm:border">
            <CardContent className="pt-6">
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">新密码</Label>
                        <Input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            disabled={isUpdatingPassword}
                            placeholder="至少 8 位，且包含字母和数字"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">确认新密码</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            disabled={isUpdatingPassword}
                            required
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={isUpdatingPassword}>
                        {isUpdatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isUpdatingPassword ? "更新中..." : "确认重置密码"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
