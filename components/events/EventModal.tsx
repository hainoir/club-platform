import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import type { Event } from "@/app/events/EventsClient"

interface EventModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (e: React.FormEvent<HTMLFormElement>) => void
    editingEvent: Event | null
    isSubmitting: boolean
    date: Date | undefined
    setDate: (date: Date | undefined) => void
}

export function EventModal({
    isOpen,
    onClose,
    onSave,
    editingEvent,
    isSubmitting,
    date,
    setDate
}: EventModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <form onSubmit={onSave}>
                    <DialogHeader>
                        <DialogTitle>{editingEvent ? "编辑活动" : "创建新活动"}</DialogTitle>
                        <DialogDescription>
                            {editingEvent ? "修改当前活动的详细信息与时间。" : "安排一个新的工作坊、讲座或俱乐部社交活动。"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-5 py-6">
                        <div className="grid gap-2">
                            <Label htmlFor="title">活动标题</Label>
                            <Input id="title" name="title" placeholder="例如：高级 TypeScript" defaultValue={editingEvent?.title} required />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>日期</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal bg-background",
                                                !date && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {date ? format(date, "PPP") : <span>选择一个日期</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={date}
                                            onSelect={setDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="time">开始时间</Label>
                                    <Input id="time" name="time" type="time" defaultValue={editingEvent?.time} required />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="endTime">结束时间</Label>
                                    <Input id="endTime" name="endTime" type="time" defaultValue={editingEvent?.endTime} />
                                </div>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="location">地点或会议链接</Label>
                            <Input id="location" name="location" placeholder="101室或Zoom链接" defaultValue={editingEvent?.location} required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="type">活动类型</Label>
                                <select id="type" name="type" defaultValue={editingEvent?.type || "工作坊"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                    <option value="工作坊">工作坊</option>
                                    <option value="讲座">讲座</option>
                                    <option value="社交">社交</option>
                                </select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="type_loc">形式</Label>
                                <select id="type_loc" name="type_loc" defaultValue={editingEvent?.isOnline ? "online" : "in_person"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring">
                                    <option value="in_person">线下</option>
                                    <option value="online">线上</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="cover">活动封面海报 (可选)</Label>
                            <Input id="cover" name="cover" type="file" accept="image/*" className="cursor-pointer file:text-muted-foreground" />
                            {editingEvent?.coverUrl && <p className="text-xs text-muted-foreground">保留为空以使用原海报。</p>}
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">详细描述 (支持 Markdown)</Label>
                            <textarea
                                id="description"
                                name="description"
                                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                                placeholder="# 活动主旨&#10;这是关于什么的？&#10;## 嘉宾信息&#10;- 张三 (全栈开发)"
                                defaultValue={editingEvent?.description || ""}
                                required
                            />
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
