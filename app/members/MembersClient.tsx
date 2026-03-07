"use client"
import * as React from "react"
import { Search, Plus, MoreHorizontal, Pencil, Trash2, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { useUserStore, ADMIN_ROLES } from "@/store/useUserStore"
import { useDebounce } from "@/hooks/useDebounce"
import { PostgrestError } from "@supabase/supabase-js"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/toast-simple"
import { cn } from "@/lib/utils"
import { MemberModal } from "@/components/members/MemberModal"

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

    // 【面试考点：全局状态管理 (Zustand)】
    // 我们避免了原生的 React Context 导致的组件树整体渲染地狱。
    // 用极小的心智负担和几乎 0 模板代码把用户的 RBAC (基于角色的访问控制) 数据抓到了本地。
    // 组件只会因为 `user` 这个解构字段发生变动而触发重绘。
    const { user } = useUserStore()
    const [members, setMembers] = React.useState<Member[]>(initialMembers)

    // 【系统学习：服务端到客户端的数据同步】
    // 监听从 Server Component 传来的 initialMembers 变化，并在变化时同步到本组件内部的 members state。
    // 这点极其重要：它是实现通过 server_action 或者 router.refresh() 无声刷新界面的底层驱动力。
    React.useEffect(() => {
        setMembers(initialMembers)
    }, [initialMembers])

    // 【面试考点：受控组件 (Controlled Components) 与 React 本地状态】
    // 凡是前端表格里面的 Input 框、搜索框录入等 UI 瞬时态，都通过 useState 手动接管。
    const [searchQuery, setSearchQuery] = React.useState("")
    // 【系统学习：防抖性能拦截】防发疯引擎：用户拼写 "John" 不会触发四次表格过滤计算
    const debouncedSearchQuery = useDebounce(searchQuery, 300)

    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [editingMember, setEditingMember] = React.useState<Member | null>(null)
    const [isSubmitting, setIsSubmitting] = React.useState(false) // 接管防抖与按钮 Loading 动画状态
    const { toast } = useToast()

    // 【系统学习：React 19 乐观更新 (useOptimistic)】
    // 通过 useOptimistic 包装原始的 members 状态。
    // 在发起真实的网络请求前，我们调用 addOptimistic 立即“欺骗” UI 进行渲染。
    // 如果后台请求由于网络波动耗时过长，用户体感上列表也已经变了，丝毫不卡顿。
    type OptimisticAction = { action: 'delete'; payload: string } | { action: 'add' | 'update'; payload: Member }
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

    // 分页系统所依赖的状态机
    const [currentPage, setCurrentPage] = React.useState(1)
    const itemsPerPage = 7

    // 【面试考点：派生状态 (Derived State) 的黄金准则】
    // 新手喜欢用 `useEffect` 去监听 `searchQuery` 的变化然后 setFilteredMembers 来改变数组。
    // 这在 React 中是极其严重的反模式（会导致二次无用渲染）。
    // 正确的做法如下：渲染期间通过底层的计算直接算出衍生变量 `filteredMembers`。
    // 当组件内任何状态变动重绘时，这里的 filter 都会用最新的数据自动算一次，绝对的 Single Source of Truth。
    const filteredMembers = optimisticMembers.filter((m) =>
        m.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        m.student_id?.includes(debouncedSearchQuery)
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
        // 乐观处理：不要等网络返回，直接先把窗给关了，提升顺滑度
        setIsDialogOpen(false)

        React.startTransition(async () => {
            try {
                if (editingMember) {
                    // 乐观更新 UI
                    addOptimistic({ action: 'update', payload: { id: editingMember.id, name, student_id, role, department, status, join_date: editingMember.join_date } })

                    // 如果弹窗之前绑定了某位现存成员，则执行基于 id 的更新操作
                    const { error } = await supabase
                        .from('members')
                        .update({ name, student_id, role, department, status })
                        .eq('id', editingMember.id)

                    if (error) throw error;
                    toast({ title: "成员已更新", description: `${name} 的详细信息已成功更新。` })
                } else {
                    // 乐观更新 UI：假造一个临时 ID 和当前时间，骗过本轮渲染
                    addOptimistic({ action: 'add', payload: { id: `temp-${Date.now()}`, name, student_id, role, department, status, join_date: new Date().toISOString() } })

                    // 否则说明是点击了左上角的“添加成员”按钮，执行增量写入
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

                setEditingMember(null)

                // 刷新当前路由，让外层的服务端组件重新获取最新数据 (服务器渲染完新页面后会覆盖我们的乐观状态)
                router.refresh()

            } catch (error: unknown) {
                console.error('保存失败:', error);
                // 【系统学习：Type 异常捕获与具体化 (Any 剥离)】
                const pError = error as PostgrestError;
                toast({ title: "保存失败", description: pError.message || (error as Error).message || "发生未知错误", variant: "destructive" })
                // 发送失败的话把窗重新弹开供用户检修
                setIsDialogOpen(true)
            } finally {
                setIsSubmitting(false)
            }
        });
    }

    const handleDelete = (id: string, name: string) => {
        // 利用 startTransition 裹挟异步操作，让 useOptimistic 知道此乐观状态能延续到异步结束
        React.startTransition(async () => {
            // 乐观删除：网速再慢，用户点下删除按钮的瞬间这一行立刻在他眼前消失
            addOptimistic({ action: 'delete', payload: id })

            try {
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

    const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);

    React.useEffect(() => {
        // 【系统学习：边界防御 (Edge Cases)】
        // 当过滤后的数据变少，导致总页数收缩时，必须强行把用户的 currentPage 给“拽”回合法区间，否则列表会渲染为空并报错。
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        } else if (totalPages === 0 && currentPage !== 1) {
            setCurrentPage(1);
        }
    }, [filteredMembers.length, totalPages, currentPage]);


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
