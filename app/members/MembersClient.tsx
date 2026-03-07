"use client"
import * as React from "react"
import { Search, Plus, MoreHorizontal, Pencil, Trash2, Download } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useUserStore, ADMIN_ROLES } from "@/store/useUserStore"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast-simple"
import { cn } from "@/lib/utils"

export type Member = {
    id: string
    name: string
    student_id?: string
    role: string
    department?: string
    join_date?: string
    status?: string
}

interface MembersClientProps {
    initialMembers: Member[]
}

export default function MembersClient({ initialMembers }: MembersClientProps) {
    const router = useRouter()
    const supabase = createClient()
    const { user } = useUserStore()
    const [members, setMembers] = React.useState<Member[]>(initialMembers)

    // Sync local state when server component passes down new data via router.refresh()
    React.useEffect(() => {
        setMembers(initialMembers)
    }, [initialMembers])

    const [searchQuery, setSearchQuery] = React.useState("")
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [editingMember, setEditingMember] = React.useState<Member | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false) // Handle smooth loading state
    const { toast } = useToast()

    const filteredMembers = members.filter((m) =>
        m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.student_id?.includes(searchQuery)
    )

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        const name = formData.get("name") as string
        const student_id = formData.get("student_id") as string || "N/A"
        const role = formData.get("role") as string
        const department = formData.get("department") as string || "未分配"
        const status = formData.get("status") as string || "active"

        setIsSubmitting(true)

        try {
            if (editingMember) {
                // Update existing
                const { error } = await supabase
                    .from('members')
                    .update({ name, student_id, role, department, status })
                    .eq('id', editingMember.id)

                if (error) throw error;
                toast({ title: "成员已更新", description: `${name} 的详细信息已成功更新。` })
            } else {
                // Insert new
                const { error } = await supabase
                    .from('members')
                    .insert([{ name, student_id, role, department, status }])

                if (error) {
                    if (error.code === '23505') {
                        throw new Error('该学号已存在于社团中');
                    }
                    throw error;
                }
                toast({ title: "成员已添加", description: `${name} 已加入俱乐部。` })
            }

            setIsSubmitting(false)
            setIsDialogOpen(false)
            setEditingMember(null)

            // 刷新当前路由，让外层的服务端组件重新获取最新数据
            router.refresh()

        } catch (error: any) {
            console.error('保存失败:', error);
            toast({ title: "保存失败", description: error.message || "发生未知错误", variant: "destructive" })
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        try {
            const { error } = await supabase.from('members').delete().eq('id', id)
            if (error) throw error;
            toast({ title: "成员已删除", description: `${name} 已被移除。`, variant: "destructive" })
            router.refresh()
        } catch (error: any) {
            toast({ title: "删除失败", description: error.message, variant: "destructive" })
        }
    }

    const openEdit = (member: Member) => {
        setEditingMember(member)
        setIsDialogOpen(true)
    }

    const exportMembersToCSV = () => {
        if (filteredMembers.length === 0) {
            toast({ title: "导出失败", description: "当前搜索条件下没有可导出的成员空列表。", variant: "destructive" })
            return;
        }

        const BOM = "\uFEFF";
        const header = ["姓名", "学号", "角色", "部门", "加入日期", "状态"].join(",");

        const rows = filteredMembers.map(m => {
            const student_id = m.student_id ? `"${m.student_id}"` : "-";
            const role = m.role === "admin" ? "管理员" : (m.role === "member" ? "成员" : m.role);
            const join_date = m.join_date ? new Date(m.join_date).toLocaleDateString('zh-CN') : "-";
            const status = m.status === "active" ? "活跃" : (m.status === "inactive" ? "停用" : "未知");
            const dept = m.department || "未分配";
            return `"${m.name}",${student_id},"${role}","${dept}","${join_date}","${status}"`;
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

    const openCreate = () => {
        setEditingMember(null)
        setIsDialogOpen(true)
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">成员管理</h2>
                    <p className="text-sm text-muted-foreground mt-1">查看和管理分支机构成员及权限。</p>
                </div>
                {ADMIN_ROLES.includes(user?.role || '') && (
                    <div className="flex gap-2 items-center">
                        <Button onClick={exportMembersToCSV} variant="outline" className="gap-2 shadow-sm transition-all focus:ring-2 bg-background hover:bg-muted">
                            <Download className="h-4 w-4" /> 导出成员
                        </Button>
                        <Button onClick={openCreate} className="gap-2 shadow-sm transition-all">
                            <Plus className="h-4 w-4" /> 添加新成员
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 max-w-sm">
                <div className="relative w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="按姓名或学号搜索..."
                        className="pl-8 bg-background shadow-sm max-w-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="border rounded-lg bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead>姓名</TableHead>
                            <TableHead>学号</TableHead>
                            <TableHead>角色</TableHead>
                            <TableHead>部门</TableHead>
                            <TableHead>加入日期</TableHead>
                            <TableHead>状态</TableHead>
                            {ADMIN_ROLES.includes(user?.role || '') && <TableHead className="w-[80px]">操作</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMembers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <Search className="h-8 w-8 text-muted-foreground/50" />
                                        <span>没有找到符合搜索条件的成员。</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredMembers.map((member) => (
                                <TableRow key={member.id} className="transition-colors hover:bg-muted/40">
                                    <TableCell className="font-medium">{member.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{member.student_id ? member.student_id : "-"}</TableCell>
                                    <TableCell>
                                        <Badge variant={["主席", "执行主席", "副主席"].includes(member.role) ? "destructive" :
                                            ["部长", "admin"].includes(member.role) ? "default" : "secondary"}>
                                            {member.role === "admin" ? "管理员" : member.role === "member" ? "成员" : member.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn(
                                            "bg-opacity-10 dark:bg-opacity-20",
                                            member.department === "开发部"
                                                ? "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-950/30"
                                                : member.department === "设计部"
                                                    ? "border-pink-200 text-pink-700 bg-pink-50 dark:border-pink-800 dark:text-pink-400 dark:bg-pink-950/30"
                                                    : member.department === "摄影部"
                                                        ? "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/30"
                                                        : "border-slate-200 text-slate-600 bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:bg-slate-800/50" // 未分配或其他
                                        )}>
                                            {member.department || "未分配"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{member.join_date ? new Date(member.join_date).toLocaleDateString('zh-CN') : "-"}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={cn(
                                            "bg-opacity-10 dark:bg-opacity-20",
                                            (member.status || "active") === "active"
                                                ? "border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50"
                                                : "border-slate-300/50 text-slate-500 bg-slate-50 dark:text-slate-400 dark:bg-slate-800"
                                        )}>
                                            {member.status === "active" ? "活跃" : (member.status === "inactive" ? "停用" : "活跃")}
                                        </Badge>
                                    </TableCell>
                                    {ADMIN_ROLES.includes(user?.role || '') && (
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                        <span className="sr-only">打开菜单</span>
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[160px]">
                                                    <DropdownMenuItem onClick={() => openEdit(member)}>
                                                        <Pencil className="mr-2 h-4 w-4" /> 编辑信息
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-destructive focus:bg-destructive focus:text-destructive-foreground" onClick={() => handleDelete(member.id, member.name)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> 移除成员
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <form onSubmit={handleSave}>
                        <DialogHeader>
                            <DialogTitle>{editingMember ? "编辑成员" : "添加新成员"}</DialogTitle>
                            <DialogDescription>
                                {editingMember ? "在这里修改该成员的详细信息。" : "将新成员信息输入系统以为其分配访问权限。"}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-5 py-6">
                            <div className="grid gap-2">
                                <Label htmlFor="name">全名</Label>
                                <Input id="name" name="name" placeholder="例如：张三" defaultValue={editingMember?.name} required />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="studentId">学号</Label>
                                <Input id="studentId" name="student_id" placeholder="例如：20230101" defaultValue={editingMember?.student_id} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="role">平台角色</Label>
                                    <select id="role" name="role" defaultValue={editingMember?.role || "干事"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                        <option value="主席">主席</option>
                                        <option value="执行主席">执行主席</option>
                                        <option value="副主席">副主席</option>
                                        <option value="部长">部长</option>
                                        <option value="干事">干事 (普通成员)</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="department">归属部门</Label>
                                    <select id="department" name="department" defaultValue={editingMember?.department || "未分配"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                        <option value="未分配">未分配</option>
                                        <option value="开发部">开发部</option>
                                        <option value="设计部">设计部</option>
                                        <option value="摄影部">摄影部</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="status">账户状态</Label>
                                    <select id="status" name="status" defaultValue={editingMember?.status || "active"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                        <option value="active">活跃</option>
                                        <option value="inactive">停用</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "保存中..." : "保存记录"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
