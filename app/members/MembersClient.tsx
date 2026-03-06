"use client"
import * as React from "react"
import { Search, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

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
    join_date?: string
    status?: string
}

interface MembersClientProps {
    initialMembers: Member[]
}

export default function MembersClient({ initialMembers }: MembersClientProps) {
    const [members, setMembers] = React.useState<Member[]>(initialMembers)
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
        const newMember: Member = {
            id: editingMember ? editingMember.id : Math.random().toString(36).substr(2, 9),
            name: formData.get("name") as string,
            student_id: formData.get("student_id") as string || "N/A",
            role: formData.get("role") as string,
            status: formData.get("status") as string || "active",
            join_date: editingMember?.join_date ? editingMember.join_date : new Date().toISOString().split('T')[0],
        }

        setIsSubmitting(true)

        // Simulate network latency for a highly polished prototype feel
        setTimeout(() => {
            if (editingMember) {
                setMembers(members.map((m) => (m.id === editingMember.id ? newMember : m)))
                toast({ title: "成员已更新", description: `${newMember.name} 的详细信息已成功更新。` })
            } else {
                setMembers([newMember, ...members])
                toast({ title: "成员已添加", description: `${newMember.name} 已加入俱乐部。` })
            }
            setIsSubmitting(false)
            setIsDialogOpen(false)
            setEditingMember(null)
        }, 600)
    }

    const handleDelete = (id: string, name: string) => {
        setMembers(members.filter((m) => m.id !== id))
        toast({ title: "成员已删除", description: `${name} 已被移除。`, variant: "destructive" })
    }

    const openEdit = (member: Member) => {
        setEditingMember(member)
        setIsDialogOpen(true)
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
                <Button onClick={openCreate} className="gap-2 shadow-sm transition-all">
                    <Plus className="h-4 w-4" /> 添加新成员
                </Button>
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
                            <TableHead>加入日期</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead className="w-[80px]">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMembers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
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
                                        <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                                            {member.role === "admin" ? "管理员" : "成员"}
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
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="role">平台角色</Label>
                                    <select id="role" name="role" defaultValue={editingMember?.role || "member"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                        <option value="member">成员</option>
                                        <option value="admin">管理员</option>
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
