import * as React from "react"
import { CheckCircle2, Trash2, Download } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Event } from "@/app/events/EventsClient"

interface AttendeesModalProps {
    isOpen: boolean
    onClose: () => void
    viewingEvent: Event | null
    isAdmin: boolean
    onExport: () => void
    onToggleAttendance: (attendeeId: string, currentStatus: boolean, attendeeName: string) => void
    onRemoveAttendee: (attendeeId: string, attendeeName: string) => void
}

export function AttendeesModal({
    isOpen,
    onClose,
    viewingEvent,
    isAdmin,
    onExport,
    onToggleAttendance,
    onRemoveAttendee
}: AttendeesModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex justify-between items-center pr-6">
                        <span>报名名单：{viewingEvent?.title}</span>
                        {isAdmin && (
                            <Button onClick={onExport} variant="outline" size="sm" className="h-8 gap-1.5 px-3">
                                <Download className="h-3.5 w-3.5" />
                                导出名单
                            </Button>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        目前共有 {viewingEvent?.attendees} 人报名参加此活动。
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
                    {(!viewingEvent?.attendeesList || viewingEvent.attendeesList.length === 0) ? (
                        <p className="text-sm text-center text-muted-foreground py-4">暂无人员报名</p>
                    ) : (
                        viewingEvent.attendeesList.map((attendee) => (
                            <div key={attendee.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors">
                                <div>
                                    <p className="text-sm font-medium leading-none flex items-center gap-2">
                                        {attendee.user_name}
                                        {attendee.is_attended && <Badge variant="outline" className="text-[10px] h-6 px-1.5 bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400">已签到</Badge>}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">{attendee.user_email}</p>
                                </div>
                                {isAdmin && (
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title={attendee.is_attended ? "撤销签到" : "标记为已签到"}
                                            className={cn("h-8 w-8", attendee.is_attended ? "text-emerald-500 hover:text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100" : "text-slate-400 hover:text-slate-600")}
                                            onClick={() => onToggleAttendance(attendee.id, !!attendee.is_attended, attendee.user_name)}
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground"
                                            onClick={() => onRemoveAttendee(attendee.id, attendee.user_name)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
