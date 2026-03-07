"use client"
import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useUserStore } from "@/store/useUserStore"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast-simple"
import { Loader2 } from "lucide-react"

export default function LoginForm() {
    const router = useRouter()
    const supabase = createClient()
    const { toast } = useToast()
    const { setUser } = useUserStore()

    const [isLoading, setIsLoading] = React.useState(false)
    const [email, setEmail] = React.useState("")
    const [password, setPassword] = React.useState("")
    const [isLoginMode, setIsLoginMode] = React.useState(true)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            if (isLoginMode) {
                // 登录
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })

                if (error) throw error

                // 获取用户信息判断权限
                if (data.user) {
                    const { data: memberData } = await supabase
                        .from('members')
                        .select('role, name')
                        .eq('email', email)
                        .single()

                    setUser({
                        id: data.user.id,
                        email: data.user.email || email,
                        role: memberData?.role || 'member',
                        name: memberData?.name || '社团成员'
                    })
                }

                toast({ title: "登录成功", description: "欢迎回来！" })
                router.push("/")
                router.refresh()
            } else {
                // 注册
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                })

                if (error) throw error

                // 如果注册成功，可以决定是否自动登入或者引导去验证邮箱
                toast({ title: "注册请求成功", description: "请检查您的电子邮箱以验证账户（如需）。如果不用验证，您可以直接登录。" })
                setIsLoginMode(true)
            }
        } catch (error: unknown) {
            toast({
                title: isLoginMode ? "登录失败" : "注册失败",
                description: (error as Error).message || "账号或密码错误",
                variant: "destructive"
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm sm:border">
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">邮箱</Label>
                        <Input
                            id="email"
                            placeholder="m@example.com"
                            type="email"
                            autoCapitalize="none"
                            autoComplete="email"
                            autoCorrect="off"
                            disabled={isLoading}
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">密码</Label>
                        <Input
                            id="password"
                            type="password"
                            disabled={isLoading}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <Button className="w-full" type="submit" disabled={isLoading}>
                        {isLoading && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {isLoginMode ? "登录" : "注册新账户"}
                    </Button>
                </form>

                <div className="mt-4 text-center text-sm">
                    {isLoginMode ? "还没有账号？" : "已有账号？"}{" "}
                    <button
                        type="button"
                        onClick={() => setIsLoginMode(!isLoginMode)}
                        className="underline hover:text-primary transition-colors"
                        disabled={isLoading}
                    >
                        {isLoginMode ? "注册" : "去登录"}
                    </button>
                </div>
            </CardContent>
        </Card>
    )
}
