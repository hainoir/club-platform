import * as React from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useDebounce } from "@/hooks/useDebounce"
import { PostgrestError } from "@supabase/supabase-js"
import { useToast } from "@/components/ui/toast-simple"
import { Member } from "@/app/members/MembersClient"
import { ensureClientSession } from "@/utils/supabase/ensure-client-session"

type OptimisticAction = { action: 'delete'; payload: string } | { action: 'add' | 'update'; payload: Member }

function normalizeSearchValue(value: unknown): string {
    if (value === null || value === undefined) return ""
    return String(value).toLowerCase()
}

export function useMembers(initialMembers: Member[]) {
    const router = useRouter()
    const supabase = createClient()
    const { toast } = useToast()

    const [members, setMembers] = React.useState<Member[]>(initialMembers)

    React.useEffect(() => {
        setMembers(initialMembers)
    }, [initialMembers])

    const [searchQuery, setSearchQuery] = React.useState("")
    const debouncedSearchQuery = useDebounce(searchQuery, 300)

    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [editingMember, setEditingMember] = React.useState<Member | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    const requireActiveSession = React.useCallback(async () => {
        const session = await ensureClientSession(supabase)
        if (session) return true

        toast({ title: "登录状态已失效", description: "请重新登录后再继续操作。", variant: "destructive" })
        return false
    }, [supabase, toast])

    const [optimisticMembers, addOptimistic] = React.useOptimistic<Member[], OptimisticAction>(
        members,
        (currentMembers, optimisticValue) => {
            switch (optimisticValue.action) {
                case 'delete':
                    return currentMembers.filter(m => m.id !== optimisticValue.payload);
                case 'update':
                    return currentMembers.map(m => m.id === (optimisticValue.payload as Member).id ? (optimisticValue.payload as Member) : m);
                case 'add':
                    return [...currentMembers, (optimisticValue.payload as Member)];
                default:
                    return currentMembers;
            }
        }
    );

    const [currentPage, setCurrentPage] = React.useState(1)
    const itemsPerPage = 7
    const normalizedQuery = debouncedSearchQuery.trim().toLowerCase()

    const filteredMembers = React.useMemo(() => {
        if (!normalizedQuery) {
            return optimisticMembers
        }

        return optimisticMembers.filter((m) => {
            const normalizedName = normalizeSearchValue(m.name)
            const normalizedStudentId = normalizeSearchValue(m.student_id)
            return normalizedName.includes(normalizedQuery) || normalizedStudentId.includes(normalizedQuery)
        })
    }, [optimisticMembers, normalizedQuery])

    const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);

    React.useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        } else if (totalPages === 0 && currentPage !== 1) {
            setCurrentPage(1);
        }
    }, [filteredMembers.length, totalPages, currentPage]);

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        const name = formData.get("name") as string
        const student_id = formData.get("student_id") as string || "N/A"
        const role = formData.get("role") as string
        const department = formData.get("department") as string || "未分配"
        const grade = formData.get("grade") as string || ""
        const status = formData.get("status") as string || "active"

        setIsSubmitting(true)
        setIsDialogOpen(false)

        React.startTransition(async () => {
            try {
                if (!(await requireActiveSession())) {
                    setIsDialogOpen(true)
                    return
                }

                if (editingMember) {
                    addOptimistic({ action: 'update', payload: { id: editingMember.id, name, student_id, role, department, grade, status, join_date: editingMember.join_date } })

                    const { error } = await supabase
                        .from('members')
                        .update({ name, student_id, role, department, grade, status })
                        .eq('id', editingMember.id)

                    if (error) throw error;
                    toast({ title: "成员已更新", description: `${name} 的详细信息已成功更新。` })
                } else {
                    addOptimistic({ action: 'add', payload: { id: `temp-${Date.now()}`, name, student_id, role, department, grade, status, join_date: new Date().toISOString() } })

                    const { error } = await supabase
                        .from('members')
                        .insert([{ name, student_id, role, department, grade, status }])

                    if (error) {
                        if (error.code === '23505') {
                            throw new Error('该学号已存在于社团中');
                        }
                        throw error;
                    }
                    toast({ title: "成员已添加", description: `${name} 已加入俱乐部。` })
                }

                setEditingMember(null)
                router.refresh()

            } catch (error: unknown) {
                console.error('保存失败:', error);
                const pError = error as PostgrestError;
                toast({ title: "保存失败", description: pError.message || (error as Error).message || "发生未知错误", variant: "destructive" })
                setIsDialogOpen(true)
            } finally {
                setIsSubmitting(false)
            }
        });
    }

    const handleDelete = (id: string, name: string) => {
        React.startTransition(async () => {
            addOptimistic({ action: 'delete', payload: id })

            try {
                if (!(await requireActiveSession())) return
                const { error } = await supabase.from('members').delete().eq('id', id)
                if (error) throw error;
                toast({ title: "成员已删除", description: `${name} 已被移除。`, variant: "destructive" })
                router.refresh()
            } catch (error: unknown) {
                const pError = error as PostgrestError;
                toast({ title: "删除失败", description: pError.message || (error as Error).message, variant: "destructive" })
            }
        });
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
        if (filteredMembers.length === 0) {
            toast({ title: "导出失败", description: "当前搜索条件下没有可导出的成员空列表。", variant: "destructive" })
            return;
        }

        const BOM = "\uFEFF";
        const header = ["姓名", "学号", "角色", "部门", "年级", "加入日期", "状态"].join(",");

        const rows = filteredMembers.map(m => {
            const student_id = m.student_id ? `"${m.student_id}"` : "-";
            const role = m.role === "admin" ? "管理员" : (m.role === "member" ? "成员" : m.role);
            const join_date = m.join_date ? new Date(m.join_date).toLocaleDateString('zh-CN') : "-";
            const status = m.status === "active" ? "活跃" : (m.status === "inactive" ? "停用" : "未知");
            const dept = m.department || "未分配";
            const grade = m.grade || "未设置";
            return `"${m.name}",${student_id},"${role}","${dept}","${grade}","${join_date}","${status}"`;
        });

        const csvContent = BOM + [header, ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `社团成员名单_${new Date().toLocaleDateString('zh-CN')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return {
        searchQuery, setSearchQuery,
        isDialogOpen, setIsDialogOpen,
        editingMember,
        isSubmitting,
        currentPage, setCurrentPage,
        itemsPerPage, totalPages,
        filteredMembers,
        handleSave,
        handleDelete,
        openEdit,
        openCreate,
        exportMembersToCSV
    }
}
