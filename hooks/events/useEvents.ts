import * as React from "react"
import { useUserStore } from "@/store/useUserStore"
import { useProtectedAction } from "@/hooks/shared/useProtectedAction"
import type { Event } from "@/components/events/EventsClient"
import { useEventCRUD } from "./useEventCRUD"
import { useEventRSVP } from "./useEventRSVP"
import { useEventAttendees } from "./useEventAttendees"

/**
 * 活动模块的编排入口
 *
 * 组合 useEventCRUD、useEventRSVP、useEventAttendees 三个子域 Hook，
 * 并提供活动列表的过滤和排序计算。
 */
export function useEvents(initialEvents: Event[]) {
    const { user } = useUserStore()
    const { requireAuth } = useProtectedAction()

    const [events, setEvents] = React.useState<Event[]>(initialEvents)
    const [showEndedEvents, setShowEndedEvents] = React.useState(false)
    const [viewMode, setViewMode] = React.useState<"all" | "enrolled">("all")

    React.useEffect(() => {
        setEvents(initialEvents)
    }, [initialEvents])

    // 子域 Hook 编排
    const crud = useEventCRUD(requireAuth)
    const rsvp = useEventRSVP(requireAuth)
    const attendees = useEventAttendees(requireAuth)

    // 活动过滤与排序
    const isEventEnded = (event: Event) => {
        if (!event.rawDate) return false;
        const compareTime = event.rawEndTime ? event.rawEndTime : event.rawDate;
        return new Date(compareTime) < new Date();
    }

    const normalizedUserEmail = (user?.email || '').trim().toLowerCase();

    const upcomingEvents = events.filter(e => {
        if (isEventEnded(e)) return false;
        if (viewMode === "enrolled" && (!normalizedUserEmail || !e.attendeesList?.some(a => a.user_email?.toLowerCase() === normalizedUserEmail))) return false;
        return true;
    });

    const endedEvents = events.filter(e => {
        if (!isEventEnded(e)) return false;
        if (viewMode === "enrolled" && (!normalizedUserEmail || !e.attendeesList?.some(a => a.user_email?.toLowerCase() === normalizedUserEmail))) return false;
        return true;
    }).sort((a, b) => {
        const timeA = new Date(a.rawEndTime || a.rawDate || 0).getTime();
        const timeB = new Date(b.rawEndTime || b.rawDate || 0).getTime();
        return timeB - timeA;
    });

    return {
        // 列表和过滤
        events,
        showEndedEvents, setShowEndedEvents,
        viewMode, setViewMode,
        upcomingEvents,
        endedEvents,

        // CRUD 操作
        isDialogOpen: crud.isDialogOpen, setIsDialogOpen: crud.setIsDialogOpen,
        isSubmitting: crud.isSubmitting,
        date: crud.date, setDate: crud.setDate,
        editingEvent: crud.editingEvent,
        openCreate: crud.openCreate,
        openEdit: crud.openEdit,
        handleDelete: crud.handleDelete,
        handleSave: crud.handleSave,

        // RSVP 操作
        handleRSVP: rsvp.handleRSVP,

        // 参与者管理
        isAttendeesDialogOpen: attendees.isAttendeesDialogOpen, setIsAttendeesDialogOpen: attendees.setIsAttendeesDialogOpen,
        viewingEvent: attendees.viewingEvent,
        openAttendeesList: attendees.openAttendeesList,
        handleRemoveAttendee: attendees.handleRemoveAttendee,
        handleToggleAttendance: attendees.handleToggleAttendance,
        exportAttendeesToCSV: attendees.exportAttendeesToCSV,
    }
}
