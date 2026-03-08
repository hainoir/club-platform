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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export default function LoginForm() {
    const router = useRouter()
    const supabase = createClient()
    const { toast } = useToast()
    const { setUser } = useUserStore()

    const [isLoading, setIsLoading] = React.useState(false)
    const [email, setEmail] = React.useState("")
    const [password, setPassword] = React.useState("")
    const [name, setName] = React.useState("")
    const [studentId, setStudentId] = React.useState("")
    const [department, setDepartment] = React.useState("")
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
                        .select('id, role, name')
                        .eq('email', email)
                        .single()

                    setUser({
                        id: memberData?.id || data.user.id, // <== 核心修复：优先取业务表主键 ID 以保证后续功能表正常关联外键
                        email: data.user.email || email,
                        role: memberData?.role || 'member',
                        name: memberData?.name || '社团成员'
                    })
                }

                toast({ title: "登录成功", description: "欢迎回来！" })
                router.push("/")
                router.refresh()
            } else {
                // 注册（携带自定义业务信息用于底层 trigger 落表）
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            name: name,
                            student_id: studentId,
                            department: department
                        }
                    }
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

                    {!isLoginMode && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="name">真实姓名</Label>
                                <Input
                                    id="name"
                                    disabled={isLoading}
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required={!isLoginMode}
                                    placeholder="请输入您的姓名"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="studentId">学号 <span className="text-muted-foreground text-xs font-normal">(可选)</span></Label>
                                <Input
                                    id="studentId"
                                    disabled={isLoading}
                                    value={studentId}
                                    onChange={e => setStudentId(e.target.value)}
                                    placeholder="例如: 20240001"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="department">所属部门 <span className="text-muted-foreground text-xs font-normal">(必填)</span></Label>
                                <Select
                                    value={department}
                                    onValueChange={setDepartment}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger id="department">
                                        <SelectValue placeholder="请选择您的挂靠部门" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="设计部">设计部</SelectItem>
                                        <SelectItem value="开发部">开发部</SelectItem>
                                        <SelectItem value="摄影部">摄影部</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}

                    <Button className="w-full mt-6" type="submit" disabled={isLoading}>
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
