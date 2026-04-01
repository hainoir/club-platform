import * as React from "react"
import { useRouter } from "next/navigation"
import { PostgrestError } from "@supabase/supabase-js"

import { useDebounce } from "@/hooks/useDebounce"
import { useToast } from "@/components/ui/toast-simple"
import { createClient } from "@/utils/supabase/client"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"
import type { Member } from "@/app/members/MembersClient"

type OptimisticAction = { action: "delete"; payload: string } | { action: "add" | "update"; payload: Member }

export type MemberSortKey = "name" | "student_id" | "role" | "department" | "grade" | "join_date" | "status"
export type MemberSortDirection = "asc" | "desc" | null

export type MemberSortConfig = {
    key: MemberSortKey | null
    direction: MemberSortDirection
}

const DEFAULT_SORT_CONFIG: MemberSortConfig = {
    key: null,
    direction: null,
}

const ROLE_SORT_PRIORITY: Record<string, number> = {
    "执行主席": 0,
    "主席": 1,
    "副主席": 2,
    "部长": 3,
    "干事": 4,
    "管理员": 5,
    admin: 5,
    "成员": 6,
    member: 6,
}

function normalizeSearchValue(value: unknown): string {
    if (value === null || value === undefined) return ""
    return String(value).trim().toLowerCase()
}

function compareText(left: string, right: string): number {
    return left.localeCompare(right, "zh-CN", {
        numeric: true,
        sensitivity: "base",
    })
}

function compareNullableText(left: unknown, right: unknown, direction: Exclude<MemberSortDirection, null>): number {
    const normalizedLeft = normalizeSearchValue(left)
    const normalizedRight = normalizeSearchValue(right)

    if (!normalizedLeft && !normalizedRight) return 0
    if (!normalizedLeft) return 1
    if (!normalizedRight) return -1

    return direction === "asc"
        ? compareText(normalizedLeft, normalizedRight)
        : compareText(normalizedRight, normalizedLeft)
}

function parseDateValue(value: string | undefined): number | null {
    if (!value) return null

    const timestamp = new Date(value).getTime()
    return Number.isNaN(timestamp) ? null : timestamp
}

function compareNullableNumber(left: number | null, right: number | null, direction: Exclude<MemberSortDirection, null>): number {
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1

    return direction === "asc" ? left - right : right - left
}

function resolveRoleSortPriority(role: string | undefined): number | null {
    const normalizedRole = normalizeSearchValue(role)
    if (!normalizedRole) return null
    return ROLE_SORT_PRIORITY[normalizedRole] ?? null
}

function compareRole(leftRole: string | undefined, rightRole: string | undefined, direction: Exclude<MemberSortDirection, null>): number {
    const leftPriority = resolveRoleSortPriority(leftRole)
    const rightPriority = resolveRoleSortPriority(rightRole)

    if (leftPriority !== null || rightPriority !== null) {
        if (leftPriority === null) return 1
        if (rightPriority === null) return -1

        if (leftPriority !== rightPriority) {
            return direction === "asc" ? leftPriority - rightPriority : rightPriority - leftPriority
        }
    }

    return compareNullableText(leftRole, rightRole, direction)
}

function compareMembers(
    left: Member,
    right: Member,
    sortConfig: { key: MemberSortKey; direction: Exclude<MemberSortDirection, null> }
): number {
    let result = 0

    switch (sortConfig.key) {
        case "name":
            result = compareNullableText(left.name, right.name, sortConfig.direction)
            break
        case "student_id":
            result = compareNullableText(left.student_id, right.student_id, sortConfig.direction)
            break
        case "role":
            result = compareRole(left.role, right.role, sortConfig.direction)
            break
        case "department":
            result = compareNullableText(left.department, right.department, sortConfig.direction)
            break
        case "grade":
            result = compareNullableText(left.grade, right.grade, sortConfig.direction)
            break
        case "join_date":
            result = compareNullableNumber(parseDateValue(left.join_date), parseDateValue(right.join_date), sortConfig.direction)
            break
        case "status":
            result = compareNullableText(left.status, right.status, sortConfig.direction)
            break
    }

    if (result !== 0) return result

    const byName = compareNullableText(left.name, right.name, "asc")
    if (byName !== 0) return byName

    return compareNullableText(left.student_id, right.student_id, "asc")
}

export function useMembers(initialMembers: Member[]) {
    const router = useRouter()
    const supabase = createClient()
    const { toast } = useToast()

    const [members, setMembers] = React.useState<Member[]>(initialMembers)
    const [searchQuery, setSearchQuery] = React.useState("")
    const debouncedSearchQuery = useDebounce(searchQuery, 300)
    const [showInactiveMembers, setShowInactiveMembers] = React.useState(false)
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [editingMember, setEditingMember] = React.useState<Member | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [currentPage, setCurrentPage] = React.useState(1)
    const [sortConfig, setSortConfig] = React.useState<MemberSortConfig>(DEFAULT_SORT_CONFIG)

    const itemsPerPage = 7
    const normalizedQuery = debouncedSearchQuery.trim().toLowerCase()

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

    const filteredMembers = React.useMemo(() => {
        if (!normalizedQuery) {
            return optimisticMembers
        }

        return optimisticMembers.filter((member) => {
            const normalizedName = normalizeSearchValue(member.name)
            const normalizedStudentId = normalizeSearchValue(member.student_id)
            return normalizedName.includes(normalizedQuery) || normalizedStudentId.includes(normalizedQuery)
        })
    }, [optimisticMembers, normalizedQuery])

    const sortedMembers = React.useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) {
            return filteredMembers
        }

        const activeSortConfig: { key: MemberSortKey; direction: Exclude<MemberSortDirection, null> } = {
            key: sortConfig.key,
            direction: sortConfig.direction,
        }

        return [...filteredMembers].sort((left, right) => compareMembers(left, right, activeSortConfig))
    }, [filteredMembers, sortConfig])

    const activeMembers = React.useMemo(
        () => sortedMembers.filter((member) => (member.status || "active") !== "inactive"),
        [sortedMembers]
    )

    const inactiveMembers = React.useMemo(
        () => sortedMembers.filter((member) => (member.status || "active") === "inactive"),
        [sortedMembers]
    )

    const inactiveMemberCount = React.useMemo(
        () => optimisticMembers.filter((member) => (member.status || "active") === "inactive").length,
        [optimisticMembers]
    )

    const totalPages = Math.ceil(activeMembers.length / itemsPerPage)

    React.useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages)
        } else if (totalPages === 0 && currentPage !== 1) {
            setCurrentPage(1)
        }
    }, [activeMembers.length, totalPages, currentPage])

    const toggleSort = React.useCallback((key: MemberSortKey) => {
        setCurrentPage(1)
        setSortConfig((currentSortConfig) => {
            if (currentSortConfig.key !== key) {
                return { key, direction: "asc" }
            }

            if (currentSortConfig.direction === "asc") {
                return { key, direction: "desc" }
            }

            if (currentSortConfig.direction === "desc") {
                return DEFAULT_SORT_CONFIG
            }

            return { key, direction: "asc" }
        })
    }, [])

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

    const exportMembersToCSV = () => {
        if (sortedMembers.length === 0) {
            toast({
                title: "导出失败",
                description: "当前搜索条件下没有可导出的成员列表。",
                variant: "destructive",
            })
            return
        }

        const BOM = "\uFEFF"
        const header = ["姓名", "学号", "角色", "部门", "年级", "加入日期", "状态"].join(",")

        const rows = sortedMembers.map((member) => {
            const student_id = member.student_id ? `"${member.student_id}"` : "-"
            const role = member.role === "admin" ? "管理员" : member.role === "member" ? "成员" : member.role
            const join_date = member.join_date ? new Date(member.join_date).toLocaleDateString("zh-CN") : "-"
            const status = member.status === "active" ? "活跃" : member.status === "inactive" ? "停用" : "未知"
            const department = member.department || "未分配"
            const grade = member.grade || "未设置"

            return `"${member.name}",${student_id},"${role}","${department}","${grade}","${join_date}","${status}"`
        })

        const csvContent = BOM + [header, ...rows].join("\n")
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")

        link.href = url
        link.setAttribute("download", `社团成员名单_${new Date().toLocaleDateString("zh-CN")}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return {
        searchQuery,
        setSearchQuery,
        isDialogOpen,
        setIsDialogOpen,
        editingMember,
        isSubmitting,
        showInactiveMembers,
        setShowInactiveMembers,
        currentPage,
        setCurrentPage,
        itemsPerPage,
        totalPages,
        sortConfig,
        toggleSort,
        activeMembers,
        inactiveMembers,
        inactiveMemberCount,
        filteredMembers: sortedMembers,
        handleSave,
        handleDelete,
        openEdit,
        openCreate,
        exportMembersToCSV,
    }
}
