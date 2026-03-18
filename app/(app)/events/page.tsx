import { createClient } from '@/utils/supabase/server';
import EventsClient, { Event } from './EventsClient';

export default async function EventsPage() {
    const supabase = await createClient();

    // 【系统学习：服务端数据拉取与外键连表】
    // 在服务端组件中直接连接数据库，获取全部活动记录。
    // 该查询会利用我们在数据库中建立的外键约束，
    // 在取活动的同时，把与之关联的报名名单一并“连表查询”出来一次性拿给前端。
    const { data: eventsData, error } = await supabase
        .from('events')
        .select('*, event_attendees(id, user_name, user_email, is_attended)')
        .order('event_date', { ascending: true }); // 按活动时间升序排列，即最早发生的排在上边

    if (error) {
        console.error("获取活动数据失败:", error);
    }

    // 【系统学习：数据对象的序列化与映射】
    // 数据库直接返回的数据往往带有后端特征（例如协调世界时格式的时间戳）。
    // 在交给客户端组件前，需要统一映射为符合前端展示逻辑的活动对象。
    const events: Event[] = eventsData?.map((e) => {
        const dateObj = new Date(e.event_date);
        let dateStr = "N/A";
        let timeStr = "N/A";

        // 第一步容错处理：确保原生日期数据合法，再转化为贴合国内阅读习惯的中文序列字符串
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

        // 取回活动的类型，如果由于历史脏数据导致类型为空，则提供默认后备值 "讲座"
        const determinedType = e.type || "讲座";

        // 【系统学习：健壮的数据兜底处理】
        // 对于嵌套活动报名列表，在交给子组件做遍历或计数前必须先判定为有效数组，避免空指针白屏。
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
            type: determinedType,
            coverUrl: e.cover_url || undefined
        };
    }) || [];

    return <EventsClient initialEvents={events} />;
}
