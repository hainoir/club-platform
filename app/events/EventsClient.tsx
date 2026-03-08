"use client"
import * as React from "react"
import { CalendarIcon, MapPin, Clock, Plus, Users, Globe, MoreHorizontal, Pencil, Trash2, Download, CheckCircle2 } from "lucide-react"
import { useUserStore, ADMIN_ROLES } from "@/store/useUserStore"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { useEvents } from "@/hooks/useEvents"
import { EventCard } from "@/components/events/EventCard"
import { EventModal } from "@/components/events/EventModal"
import { AttendeesModal } from "@/components/events/AttendeesModal"

export type Attendee = {
    id: string
    user_email: string
    user_name: string
    is_attended?: boolean
}

export type Event = {
    id: string
    title: string
    date: string
    time: string
    endTime?: string
    rawDate?: string
    rawEndTime?: string | null
    location: string
    isOnline: boolean
    description: string
    attendees: number
    attendeesList?: Attendee[]
    type: string
    coverUrl?: string
}

interface EventsClientProps {
    initialEvents: Event[]
}

export default function EventsClient({ initialEvents }: EventsClientProps) {
    const { user } = useUserStore()

    const {
        isDialogOpen, setIsDialogOpen,
        isSubmitting,
        showEndedEvents, setShowEndedEvents,
        date, setDate,
        editingEvent,
        isAttendeesDialogOpen, setIsAttendeesDialogOpen,
        viewMode, setViewMode,
        viewingEvent,
        openCreate,
        openEdit,
        handleDelete,
        handleSave,
        handleRSVP,
        openAttendeesList,
        handleRemoveAttendee,
        handleToggleAttendance,
        upcomingEvents,
        endedEvents,
        exportAttendeesToCSV
    } = useEvents(initialEvents)

    const renderEventCard = (event: Event, isEnded: boolean) => (
        <EventCard
            key={event.id}
            event={event}
            isEnded={isEnded}
            isAdmin={ADMIN_ROLES.includes(user?.role || '')}
            currentUserEmail={user?.email}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAttendeesClick={openAttendeesList}
            onRSVP={handleRSVP}
        />
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-in-out">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">活动与课程</h2>
                    <p className="text-sm text-muted-foreground mt-1">即将举办的工作坊、讲座和俱乐部活动。</p>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex space-x-1 bg-muted/50 p-1 rounded-lg border">
                        <Button
                            variant={viewMode === "all" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("all")}
                            className="rounded-md text-xs sm:text-sm"
                        >
                            活动大厅
                        </Button>
                        <Button
                            variant={viewMode === "enrolled" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("enrolled")}
                            className="rounded-md text-xs sm:text-sm disabled:opacity-50"
                            disabled={!user}
                        >
                            我的报名 {!user && '(未登录)'}
                        </Button>
                    </div>
                    {ADMIN_ROLES.includes(user?.role || '') && (
                        <Button onClick={openCreate} className="gap-2 shadow-sm transition-all focus:ring-2">
                            <Plus className="h-4 w-4" /> 创建活动
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingEvents.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg bg-card/30">
                        <CalendarIcon className="h-12 w-12 mx-auto opacity-20 mb-3" />
                        <p>近期暂无即将举办的活动。</p>
                    </div>
                ) : (
                    upcomingEvents.map(e => renderEventCard(e, false))
                )}
            </div>

            {endedEvents.length > 0 && (
                <div className="pt-8 mt-8 border-t border-slate-200 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-semibold opacity-80 flex items-center gap-2">
                            <Clock className="h-5 w-5" /> 历史长廊
                        </h3>
                        <Button variant="outline" size="sm" onClick={() => setShowEndedEvents(!showEndedEvents)}>
                            {showEndedEvents ? "隐藏已结束活动" : `查看已结束的 ${endedEvents.length} 个活动`}
                        </Button>
                    </div>

                    {showEndedEvents && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            {endedEvents.map(e => renderEventCard(e, true))}
                        </div>
                    )}
                </div>
            )}

            <EventModal
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSave={handleSave}
                editingEvent={editingEvent}
                isSubmitting={isSubmitting}
                date={date}
                setDate={setDate}
            />

            <AttendeesModal
                isOpen={isAttendeesDialogOpen}
                onClose={() => setIsAttendeesDialogOpen(false)}
                viewingEvent={viewingEvent}
                isAdmin={ADMIN_ROLES.includes(user?.role || '')}
                onExport={exportAttendeesToCSV}
                onToggleAttendance={handleToggleAttendance}
                onRemoveAttendee={handleRemoveAttendee}
            />
        </div>
    )
}

