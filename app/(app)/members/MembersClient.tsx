"use client"
import * as React from "react"
import { Search, Plus, MoreHorizontal, Pencil, Trash2, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { useUserStore, isAdminRole } from "@/store/useUserStore"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MemberModal } from "@/components/members/MemberModal"
import { useMembers } from "@/hooks/useMembers"

export type Member = {
    id: string
    name: string
    student_id?: string | number | null
    role: string
    department?: string
    grade?: string
    join_date?: string
    status?: string
}

interface MembersClientProps {
    initialMembers: Member[]
}

export default function MembersClient({ initialMembers }: MembersClientProps) {
    const { user } = useUserStore()
    const {
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
    } = useMembers(initialMembers)

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">成员管理</h2>
                    <p className="text-sm text-muted-foreground mt-1">查看和管理社团成员及权限。</p>
                </div>
                {isAdminRole(user?.role) && (
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

            <div className="flex items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="搜索姓名、学号或相关信息..."
                        className="w-full bg-background pl-8 sm:w-[300px]"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1); // 每次触发新搜索时强制回退到第一页，防止分页游标越界
                        }}
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
                            <TableHead>年级</TableHead>
                            <TableHead>加入日期</TableHead>
                            <TableHead>状态</TableHead>
                            {isAdminRole(user?.role) && <TableHead className="w-[80px]">操作</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMembers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <Search className="h-8 w-8 text-muted-foreground/50" />
                                        <span>没有找到符合搜索条件的成员。</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredMembers
                                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                .map((member) => (
                                    <TableRow key={member.id} className="group hover:bg-slate-50/50 dark:hover:bg-zinc-800/50">
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
                                        <TableCell>
                                            <Badge variant="outline">
                                                {member.grade || "未设置"}
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
                                        {isAdminRole(user?.role) && (
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

            {filteredMembers.length > itemsPerPage && (
                <div className="border-t px-6 py-4 flex items-center justify-between text-sm text-muted-foreground">
                    <div>
                        显示第 {(currentPage - 1) * itemsPerPage + 1} 到 {Math.min(currentPage * itemsPerPage, filteredMembers.length)} 条记录，共 {filteredMembers.length} 条
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-8 gap-1 pl-2.5"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            上一页
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            className="h-8 gap-1 pr-2.5"
                        >
                            下一页
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            <MemberModal
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSave={handleSave}
                editingMember={editingMember}
                isSubmitting={isSubmitting}
            />
        </div>
    )
}
