import type { AppNotification, NotificationSourceContext } from "../types"

export async function getEventReminderNotifications({
    supabase,
    user,
    now,
    eventReminder,
}: NotificationSourceContext): Promise<AppNotification[]> {
    if (!eventReminder) return []

    const enrolledEventsResult = await supabase
        .from("event_attendees")
        .select("id, event:events!event_attendees_event_id_fkey(id, title, event_date)")
        .eq("user_email", user.email)

    const items: AppNotification[] = []

    ;(enrolledEventsResult.data || []).forEach((row: any) => {
        const event = Array.isArray(row.event) ? row.event[0] : row.event
        if (!event?.event_date) return

        const eventTime = new Date(event.event_date)
        const diffMs = eventTime.getTime() - now.getTime()
        const diffHours = diffMs / 1000 / 60 / 60

        if (diffHours <= 0 || diffHours > 72) return

        items.push({
            id: `event-enrolled-${event.id}`,
            title: "已报名活动即将开始",
            description: `${event.title} 约在 ${Math.max(1, Math.round(diffHours))} 小时后开始。`,
            href: "/events",
            createdAt: event.event_date,
            level: diffHours <= 12 ? "warning" : "info",
        })
    })

    return items
}
