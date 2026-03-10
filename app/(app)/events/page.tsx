import { createClient } from '@/utils/supabase/server';
import EventsClient, { Event } from './EventsClient';

export default async function EventsPage() {
    const supabase = await createClient();

    // 【系统学习：服务端数据拉取与外键连表】
    // 在 Server Component 中直接连接 Supabase 获取所有的活动记录。
    // "select('*, event_attendees(...))" 会利用我们在数据库中建立的外键约束，
    // 在取活动的同时，把与之关联的报名名单一并“连表查询”出来一次性拿给前端。
    const { data: eventsData, error } = await supabase
        .from('events')
        .select('*, event_attendees(id, user_name, user_email, is_attended)')
        .order('event_date', { ascending: true }); // 按活动时间升序排列，即最早发生的排在上边

    if (error) {
        console.error("获取活动数据失败:", error);
    }

    // 【系统学习：数据对象的序列化与映射 (Mapping)】
    // 数据库直接吐出来的数据往往带有后端特征(比如 ISO 格式的格林威治时间戳)。
    // 在把它们交给客户端组件之前，我们需要把它们统一解构转换(map)成符合前端 UI 展示逻辑的纯粹 Event 对象。
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
        // 对于嵌套的活动报名列表，在拿给底层子组件进行 .map() 或 .length 计算前必须强制判定是否为有效数组，避免前端引发空指针白屏崩溃。
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
