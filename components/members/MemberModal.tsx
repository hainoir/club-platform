import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Member } from "@/app/members/MembersClient"

interface MemberModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (e: React.FormEvent<HTMLFormElement>) => void
    editingMember: Member | null
    isSubmitting: boolean
}

export function MemberModal({ isOpen, onClose, onSave, editingMember, isSubmitting }: MemberModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={onSave}>
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
                        <Button type="button" variant="outline" onClick={onClose}>取消</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "保存中..." : "保存记录"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
