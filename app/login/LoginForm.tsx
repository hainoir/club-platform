"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { createClient } from "@/utils/supabase/client"
import { normalizeUserRole, useUserStore } from "@/store/useUserStore"
import { useToast } from "@/components/ui/toast-simple"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

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

export default function LoginForm() {
    const router = useRouter()
    const supabase = React.useMemo(() => createClient(), [])
    const { toast } = useToast()
    const { setUser } = useUserStore()

    const [isLoading, setIsLoading] = React.useState(false)
    const [email, setEmail] = React.useState("")
    const [password, setPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [name, setName] = React.useState("")
    const [studentId, setStudentId] = React.useState("")
    const [department, setDepartment] = React.useState("")
    const [grade, setGrade] = React.useState("")
    const [isLoginMode, setIsLoginMode] = React.useState(true)

    const validateRegisterForm = React.useCallback(() => {
        if (name.trim().length < 2) {
            throw new Error("姓名至少需要 2 个字符")
        }

        if (!department) {
            throw new Error("请选择部门")
        }

        if (!grade) {
            throw new Error("请选择年级")
        }

        if (password.length < 8) {
            throw new Error("密码长度至少为 8 位")
        }

        const weakPassword = !/(?=.*[A-Za-z])(?=.*\d).{8,}/.test(password)
        if (weakPassword) {
            throw new Error("密码需至少包含字母和数字")
        }

        if (password !== confirmPassword) {
            throw new Error("两次输入的密码不一致")
        }

        if (studentId && !/^\d{4,18}$/.test(studentId)) {
            throw new Error("学号需为 4-18 位数字")
        }
    }, [confirmPassword, department, grade, name, password, studentId])

    const syncOrCreateMemberProfile = React.useCallback(
        async (
            normalizedEmail: string,
            fallbackAuthId: string,
            profileSeed?: {
                name?: string
                department?: string
                grade?: string
                studentId?: string | null
            }
        ) => {
            const safeName = profileSeed?.name?.trim() || "社团成员"
            const safeDepartment = profileSeed?.department || null
            const safeGrade = profileSeed?.grade || null
            const safeStudentId = profileSeed?.studentId || null

            const { data: existingMember, error: lookupError } = await supabase
                .from("members")
                .select("id, role, name")
                .eq("email", normalizedEmail)
                .maybeSingle()

            if (lookupError && lookupError.code !== "PGRST116") {
                throw lookupError
            }

            if (!existingMember) {
                const { error: insertError } = await supabase.from("members").insert({
                    id: fallbackAuthId,
                    email: normalizedEmail,
                    name: safeName,
                    role: "member",
                    student_id: safeStudentId,
                    department: safeDepartment,
                    grade: safeGrade,
                    status: "active",
                    join_date: new Date().toISOString().slice(0, 10),
                })

                if (insertError && insertError.code !== "23505") {
                    throw insertError
                }
            }

            const { data: memberData } = await supabase
                .from("members")
                .select("id, role, name")
                .eq("email", normalizedEmail)
                .maybeSingle()

            setUser({
                id: memberData?.id || fallbackAuthId,
                email: normalizedEmail,
                role: normalizeUserRole(memberData?.role) || "member",
                name: memberData?.name || safeName,
            })
        },
        [setUser, supabase]
    )

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const normalizedEmail = email.trim().toLowerCase()
            if (!normalizedEmail) {
                throw new Error("请输入邮箱")
            }

            if (isLoginMode) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: normalizedEmail,
                    password,
                })

                if (error) throw error

                if (data.user) {
                    await syncOrCreateMemberProfile(normalizedEmail, data.user.id)
                }

                toast({ title: "登录成功", description: "欢迎回来。" })
                router.push("/")
                router.refresh()
            } else {
                validateRegisterForm()

                const safeStudentId = studentId.trim() || null
                const { error: signUpError } = await supabase.auth.signUp({
                    email: normalizedEmail,
                    password,
                    options: {
                        data: {
                            name: name.trim(),
                            student_id: safeStudentId,
                            department: department || null,
                            grade: grade || null,
                        },
                    },
                })

                if (signUpError) throw signUpError

                const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
                    email: normalizedEmail,
                    password,
                })

                if (signInErr || !signInData.user) {
                    toast({ title: "注册成功", description: "请前往邮箱完成验证后再登录。" })
                    setIsLoginMode(true)
                } else {
                    await syncOrCreateMemberProfile(normalizedEmail, signInData.user.id, {
                        name,
                        department,
                        grade,
                        studentId: safeStudentId,
                    })
                    toast({ title: "注册成功", description: "账号已创建并可立即使用。" })
                    router.push("/")
                    router.refresh()
                }
            }
        } catch (error: unknown) {
            let errorMsg = (error as Error).message || "账号或密码错误"

            if (errorMsg.includes("Invalid login credentials")) {
                errorMsg = "邮箱未注册或密码错误"
            } else if (errorMsg.includes("User already registered")) {
                errorMsg = "该邮箱已注册"
            } else if (errorMsg.includes("Email rate limit exceeded")) {
                errorMsg = "请求过于频繁，请稍后再试"
            } else if (errorMsg.includes("Database error saving new user")) {
                errorMsg = "资料校验失败，请检查注册信息"
            }

            toast({
                title: isLoginMode ? "登录失败" : "注册失败",
                description: errorMsg,
                variant: "destructive",
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
                            placeholder="name@example.com"
                            type="email"
                            autoCapitalize="none"
                            autoComplete="email"
                            autoCorrect="off"
                            disabled={isLoading}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
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
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        {!isLoginMode && <p className="text-xs text-muted-foreground">至少 8 位，且包含字母与数字。</p>}
                    </div>

                    {!isLoginMode && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">确认密码</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    disabled={isLoading}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required={!isLoginMode}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="name">姓名</Label>
                                <Input
                                    id="name"
                                    disabled={isLoading}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required={!isLoginMode}
                                    placeholder="请输入姓名"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="studentId">
                                    学号 <span className="text-muted-foreground text-xs font-normal">(可选)</span>
                                </Label>
                                <Input
                                    id="studentId"
                                    disabled={isLoading}
                                    value={studentId}
                                    onChange={(e) => setStudentId(e.target.value.replace(/\s/g, ""))}
                                    placeholder="例如：20240001"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="department">
                                    部门 <span className="text-muted-foreground text-xs font-normal">(必填)</span>
                                </Label>
                                <Select value={department} onValueChange={setDepartment} disabled={isLoading}>
                                    <SelectTrigger id="department">
                                        <SelectValue placeholder="请选择部门" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DEPARTMENT_OPTIONS.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="grade">
                                    年级 <span className="text-muted-foreground text-xs font-normal">(必填)</span>
                                </Label>
                                <Select value={grade} onValueChange={setGrade} disabled={isLoading}>
                                    <SelectTrigger id="grade">
                                        <SelectValue placeholder="请选择年级" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {GRADE_OPTIONS.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}

                    <Button className="w-full mt-6" type="submit" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isLoginMode ? "登录" : "创建账号"}
                    </Button>
                </form>

                <div className="mt-4 text-center text-sm">
                    {isLoginMode ? "还没有账号？" : "已有账号？"}{" "}
                    <button
                        type="button"
                        onClick={() => {
                            setIsLoginMode(!isLoginMode)
                            setConfirmPassword("")
                        }}
                        className="underline hover:text-primary transition-colors"
                        disabled={isLoading}
                    >
                        {isLoginMode ? "立即注册" : "返回登录"}
                    </button>
                </div>
            </CardContent>
        </Card>
    )
}
