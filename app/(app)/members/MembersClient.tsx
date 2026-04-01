"use client"

import * as React from "react"
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Download,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Trash2,
} from "lucide-react"

import { useMembers, type MemberSortConfig, type MemberSortKey } from "@/hooks/useMembers"
import { cn } from "@/lib/utils"
import { isAdminRole, useUserStore } from "@/store/useUserStore"
import { MemberModal } from "@/components/members/MemberModal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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

const MEMBER_TABLE_COLUMN_WIDTHS = ["13%", "16%", "12%", "14%", "11%", "14%", "12%"] as const
const MEMBER_TABLE_COLUMN_WIDTHS_WITH_ACTION = [...MEMBER_TABLE_COLUMN_WIDTHS, "80px"] as const
const MEMBER_TABLE_MIN_WIDTH_CLASS = {
    default: "min-w-[720px]",
    admin: "min-w-[820px]",
} as const

const SORTABLE_COLUMNS: Array<{ key: MemberSortKey; label: string }> = [
    { key: "name", label: "姓名" },
    { key: "student_id", label: "学号" },
    { key: "role", label: "角色" },
    { key: "department", label: "部门" },
    { key: "grade", label: "年级" },
    { key: "join_date", label: "加入日期" },
    { key: "status", label: "状态" },
]

function getRoleBadgeVariant(role: string) {
    if (["主席", "执行主席", "副主席"].includes(role)) return "destructive"
    if (["部长", "admin", "管理员"].includes(role)) return "default"
    return "secondary"
}

function getRoleLabel(role: string) {
    if (role === "admin") return "管理员"
    if (role === "member") return "成员"
    return role
}

function getDepartmentBadgeClass(department?: string) {
    if (department === "开发部") {
        return "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-950/30"
    }

    if (department === "设计部") {
        return "border-pink-200 text-pink-700 bg-pink-50 dark:border-pink-800 dark:text-pink-400 dark:bg-pink-950/30"
    }

    if (department === "摄影部") {
        return "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:bg-amber-950/30"
    }

    return "border-slate-200 text-slate-600 bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:bg-slate-800/50"
}

function getStatusLabel(status?: string) {
    return status === "inactive" ? "停用" : "活跃"
}

function SortIndicator({ isActive, direction }: { isActive: boolean; direction: MemberSortConfig["direction"] }) {
    if (!isActive || !direction) {
        return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />
    }

    return direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
}

function SortableTableHead({
    column,
    sortConfig,
    onSort,
}: {
    column: (typeof SORTABLE_COLUMNS)[number]
    sortConfig: MemberSortConfig
    onSort: (key: MemberSortKey) => void
}) {
    const isActive = sortConfig.key === column.key && sortConfig.direction !== null

    return (
        <TableHead>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSort(column.key)}
                className="h-8 px-0 text-left font-semibold text-foreground hover:bg-transparent hover:text-foreground"
                aria-label={`按 ${column.label} 排序`}
            >
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {column.label}
                    <SortIndicator isActive={isActive} direction={sortConfig.direction} />
                </span>
            </Button>
        </TableHead>
    )
}

function MembersTable({
    members,
    isAdmin,
    emptyMessage,
    sortConfig,
    onSort,
    onEdit,
    onDelete,
}: {
    members: Member[]
    isAdmin: boolean
    emptyMessage: string
    sortConfig: MemberSortConfig
    onSort: (key: MemberSortKey) => void
    onEdit: (member: Member) => void
    onDelete: (id: string, name: string) => void
}) {
    const columnWidths = isAdmin ? MEMBER_TABLE_COLUMN_WIDTHS_WITH_ACTION : MEMBER_TABLE_COLUMN_WIDTHS
    const minTableWidthClass = isAdmin ? MEMBER_TABLE_MIN_WIDTH_CLASS.admin : MEMBER_TABLE_MIN_WIDTH_CLASS.default

    return (
        <div className="overflow-hidden rounded-lg border bg-card/50 shadow-sm backdrop-blur-sm [&>div]:overflow-x-auto [&>div]:overscroll-x-contain [&>div]:touch-pan-x">
            <Table className={cn("table-fixed", minTableWidthClass)}>
                <colgroup>
                    {columnWidths.map((width, index) => (
                        <col key={`${width}-${index}`} style={{ width }} />
                    ))}
                </colgroup>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        {SORTABLE_COLUMNS.map((column) => (
                            <SortableTableHead key={column.key} column={column} sortConfig={sortConfig} onSort={onSort} />
                        ))}
                        {isAdmin && <TableHead className="w-[80px]">操作</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {members.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-muted-foreground">
                                <div className="flex flex-col items-center gap-2">
                                    <Search className="h-8 w-8 text-muted-foreground/50" />
                                    <span>{emptyMessage}</span>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : (
                        members.map((member) => (
                            <TableRow key={member.id} className="group hover:bg-slate-50/50 dark:hover:bg-zinc-800/50">
                                <TableCell className="font-medium">{member.name}</TableCell>
                                <TableCell className="text-muted-foreground">{member.student_id || "-"}</TableCell>
                                <TableCell>
                                    <Badge variant={getRoleBadgeVariant(member.role)}>{getRoleLabel(member.role)}</Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={cn("bg-opacity-10 dark:bg-opacity-20", getDepartmentBadgeClass(member.department))}
                                    >
                                        {member.department || "未分配"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">{member.grade || "未设置"}</Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {member.join_date ? new Date(member.join_date).toLocaleDateString("zh-CN") : "-"}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "bg-opacity-10 dark:bg-opacity-20",
                                            (member.status || "active") === "active"
                                                ? "border-emerald-500/30 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                                                : "border-slate-300/50 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                        )}
                                    >
                                        {getStatusLabel(member.status)}
                                    </Badge>
                                </TableCell>
                                {isAdmin && (
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                    <span className="sr-only">打开菜单</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-[160px]">
                                                <DropdownMenuItem onClick={() => onEdit(member)}>
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    编辑信息
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                                                    onClick={() => onDelete(member.id, member.name)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    移除成员
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
    )
}

export default function MembersClient({ initialMembers }: MembersClientProps) {
    const { user } = useUserStore()
    const isAdmin = isAdminRole(user?.role)
    const {
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
        handleSave,
        handleDelete,
        openEdit,
        openCreate,
        exportMembersToCSV,
    } = useMembers(initialMembers)

    const paginatedActiveMembers = activeMembers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    return (
        <div className="animate-in space-y-6 fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">成员管理</h2>
                    <p className="mt-1 text-sm text-muted-foreground">查看和管理社团成员及权限。</p>
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={exportMembersToCSV}
                            variant="outline"
                            className="gap-2 bg-background shadow-sm transition-all hover:bg-muted focus:ring-2"
                        >
                            <Download className="h-4 w-4" />
                            导出成员
                        </Button>
                        <Button onClick={openCreate} className="gap-2 shadow-sm transition-all">
                            <Plus className="h-4 w-4" />
                            添加新成员
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
                        onChange={(event) => {
                            setSearchQuery(event.target.value)
                            setCurrentPage(1)
                        }}
                    />
                </div>
            </div>

            <MembersTable
                members={paginatedActiveMembers}
                isAdmin={isAdmin}
                emptyMessage="没有找到符合搜索条件的活跃成员。"
                sortConfig={sortConfig}
                onSort={toggleSort}
                onEdit={openEdit}
                onDelete={handleDelete}
            />

            {activeMembers.length > itemsPerPage && (
                <div className="flex items-center justify-between border-t px-6 py-4 text-sm text-muted-foreground">
                    <div>
                        显示第 {(currentPage - 1) * itemsPerPage + 1} 到 {Math.min(currentPage * itemsPerPage, activeMembers.length)} 条记录，共 {activeMembers.length} 条
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                            disabled={currentPage === 1}
                            className="h-8 gap-1 pl-2.5"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            上一页
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                            disabled={currentPage >= totalPages}
                            className="h-8 gap-1 pr-2.5"
                        >
                            下一页
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {inactiveMemberCount > 0 && (
                <div className="mt-8 border-t border-slate-200 pt-8 dark:border-zinc-800">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-xl font-semibold opacity-80">
                            <Clock className="h-5 w-5" />
                            停用成员
                        </h3>
                        <Button variant="outline" size="sm" onClick={() => setShowInactiveMembers(!showInactiveMembers)}>
                            {showInactiveMembers ? "隐藏停用成员" : `查看已停用的 ${inactiveMemberCount} 位成员`}
                        </Button>
                    </div>

                    {showInactiveMembers && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                            <MembersTable
                                members={inactiveMembers}
                                isAdmin={isAdmin}
                                emptyMessage="没有找到符合搜索条件的停用成员。"
                                sortConfig={sortConfig}
                                onSort={toggleSort}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                            />
                        </div>
                    )}
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
