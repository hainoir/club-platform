import { createClient } from '@/utils/supabase/server';
import EventsClient, { Event } from './EventsClient';

export default async function EventsPage() {
    const supabase = await createClient();

    // Fetch all events from the Supabase 'events' table, joining with attendees
    const { data: eventsData, error } = await supabase
        .from('events')
        .select('*, event_attendees(id, user_name, user_email, is_attended)')
        .order('event_date', { ascending: true }); // Order by event date, earliest first

    if (error) {
        console.error("获取活动数据失败:", error);
    }

    // Map database data to frontend component 'Event' structure
    const events: Event[] = eventsData?.map((e) => {
        const dateObj = new Date(e.event_date);
        let dateStr = "N/A";
        let timeStr = "N/A";

        // Ensure date is valid before trying to format
        if (!isNaN(dateObj.getTime())) {
            dateStr = dateObj.toLocaleDateString("zh-CN", { year: 'numeric', month: 'long', day: 'numeric' });
            timeStr = dateObj.toLocaleTimeString("zh-CN", { hour: '2-digit', minute: '2-digit' });
        }

        let endTimeStr = undefined;
        if (e.end_time) {
            const endObj = new Date(e.end_time);
            if (!isNaN(endObj.getTime())) {
                endTimeStr = endObj.toLocaleTimeString("zh-CN", { hour: '2-digit', minute: '2-digit' });
            }
        }

        const isOnline = e.is_online || false;

        // Use the actual type from DB, default to "讲座" if somehow not set
        const determinedType = e.type || "讲座";

        // Ensure attendees is safely treated as an array and counted
        const attendeesList = Array.isArray(e.event_attendees) ? e.event_attendees : [];

        return {
            id: String(e.id),
            title: e.title || "未命名活动",
            date: dateStr,
            time: timeStr,
            endTime: endTimeStr,
            rawDate: e.event_date,
            rawEndTime: e.end_time || null,
            location: e.location || "待定",
            isOnline: isOnline,
            description: e.description || "暂无描述",
            attendees: attendeesList.length,
            attendeesList: attendeesList,
            type: determinedType
        };
    }) || [];

    return <EventsClient initialEvents={events} />;
}
