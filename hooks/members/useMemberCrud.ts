import * as React from "react"
import { useRouter } from "next/navigation"
import { PostgrestError } from "@supabase/supabase-js"

import { useToast } from "@/components/ui/toast-simple"
import { createClient } from "@/utils/supabase/client"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"
import type { Member } from "@/app/members/MembersClient"

type OptimisticAction = { action: "delete"; payload: string } | { action: "add" | "update"; payload: Member }

export function useMemberCrud(initialMembers: Member[]) {
    const router = useRouter()
    const supabase = createClient()
    const { toast } = useToast()

    const [members, setMembers] = React.useState<Member[]>(initialMembers)
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [editingMember, setEditingMember] = React.useState<Member | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    React.useEffect(() => {
        setMembers(initialMembers)
    }, [initialMembers])

    const requireActiveSession = React.useCallback(async () => {
        const session = await ensureClientSession(supabase)
        if (session) return true

        toast({
            title: "登录状态已失效",
            description: "请重新登录后再继续操作。",
            variant: "destructive",
        })
        return false
    }, [supabase, toast])

    const [optimisticMembers, addOptimistic] = React.useOptimistic<Member[], OptimisticAction>(
        members,
        (currentMembers, optimisticValue) => {
            switch (optimisticValue.action) {
                case "delete":
                    return currentMembers.filter((member) => member.id !== optimisticValue.payload)
                case "update":
                    return currentMembers.map((member) =>
                        member.id === optimisticValue.payload.id ? optimisticValue.payload : member
                    )
                case "add":
                    return [...currentMembers, optimisticValue.payload]
                default:
                    return currentMembers
            }
        }
    )

    const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        const name = formData.get("name") as string
        const student_id = (formData.get("student_id") as string) || "N/A"
        const role = formData.get("role") as string
        const department = (formData.get("department") as string) || "未分配"
        const grade = (formData.get("grade") as string) || ""
        const status = (formData.get("status") as string) || "active"

        setIsSubmitting(true)
        setIsDialogOpen(false)

        React.startTransition(async () => {
            try {
                if (!(await requireActiveSession())) {
                    setIsDialogOpen(true)
                    return
                }

                if (editingMember) {
                    addOptimistic({
                        action: "update",
                        payload: {
                            id: editingMember.id,
                            name,
                            student_id,
                            role,
                            department,
                            grade,
                            status,
                            join_date: editingMember.join_date,
                        },
                    })

                    const { error } = await supabase
                        .from("members")
                        .update({ name, student_id, role, department, grade, status })
                        .eq("id", editingMember.id)

                    if (error) throw error

                    toast({
                        title: "成员已更新",
                        description: `${name} 的详细信息已成功更新。`,
                    })
                } else {
                    addOptimistic({
                        action: "add",
                        payload: {
                            id: `temp-${Date.now()}`,
                            name,
                            student_id,
                            role,
                            department,
                            grade,
                            status,
                            join_date: new Date().toISOString(),
                        },
                    })

                    const { error } = await supabase.from("members").insert([{ name, student_id, role, department, grade, status }])

                    if (error) {
                        if (error.code === "23505") {
                            throw new Error("该学号已存在于社团中")
                        }
                        throw error
                    }

                    toast({
                        title: "成员已添加",
                        description: `${name} 已加入俱乐部。`,
                    })
                }

                setEditingMember(null)
                router.refresh()
            } catch (error: unknown) {
                console.error("保存失败:", error)
                const postgrestError = error as PostgrestError
                toast({
                    title: "保存失败",
                    description: postgrestError.message || (error as Error).message || "发生未知错误",
                    variant: "destructive",
                })
                setIsDialogOpen(true)
            } finally {
                setIsSubmitting(false)
            }
        })
    }

    const handleDelete = (id: string, name: string) => {
        React.startTransition(async () => {
            addOptimistic({ action: "delete", payload: id })

            try {
                if (!(await requireActiveSession())) return

                const { error } = await supabase.from("members").delete().eq("id", id)
                if (error) throw error

                toast({
                    title: "成员已删除",
                    description: `${name} 已被移除。`,
                    variant: "destructive",
                })
                router.refresh()
            } catch (error: unknown) {
                const postgrestError = error as PostgrestError
                toast({
                    title: "删除失败",
                    description: postgrestError.message || (error as Error).message,
                    variant: "destructive",
                })
            }
        })
    }

    const openEdit = (member: Member) => {
        setEditingMember(member)
        setIsDialogOpen(true)
    }

    const openCreate = () => {
        setEditingMember(null)
        setIsDialogOpen(true)
    }

    return {
        optimisticMembers,
        isDialogOpen,
        setIsDialogOpen,
        editingMember,
        isSubmitting,
        handleSave,
        handleDelete,
        openEdit,
        openCreate,
    }
}
