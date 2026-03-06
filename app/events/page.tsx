import { createClient } from '@/utils/supabase/server';
import EventsClient, { Event } from './EventsClient';

export default async function EventsPage() {
    const supabase = await createClient();

    // Fetch all events from the Supabase 'events' table
    const { data: eventsData, error } = await supabase
        .from('events')
        .select('*')
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

        const isOnline = e.location?.includes("Zoom") || e.location?.includes("腾讯会议") || false;

        // Derive type from description or title for the prototype frontend to look colorful
        let determinedType: "工作坊" | "社交" | "讲座" = "讲座";
        if (e.title?.includes("工作坊") || e.title?.includes("实战")) {
            determinedType = "工作坊";
        } else if (e.title?.includes("聚会") || e.title?.includes("启动会") || e.title?.includes("社交") || e.title?.includes("晚会")) {
            determinedType = "社交";
        }

        return {
            id: String(e.id),
            title: e.title || "未命名活动",
            date: dateStr,
            time: timeStr,
            location: e.location || "待定",
            isOnline: isOnline,
            description: e.description || "暂无描述",
            attendees: 0, // In the real world, this could come from a JOIN with an attendees or RSVP table
            type: determinedType
        };
    }) || [];

    return <EventsClient initialEvents={events} />;
}
