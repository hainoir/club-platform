import { createClient } from '@/utils/supabase/server';
import MembersClient, { Member } from './MembersClient';

export default async function MembersPage() {
    const supabase = await createClient();

    // 从 Supabase 的 members 表中查询所有社团成员数据
    const { data: membersData, error } = await supabase
        .from('members')
        .select('*')
        .order('id', { ascending: true }); // 按 ID 升序排列，保证新加入的成员在底部

    // 如果出错或没数据，你可以选择处理（比如传空数组进行容错或者显示错误）
    if (error) {
        console.error("获取成员数据失败:", error);
    }

    // 将数据库的数据映射为前端组件需要的结构
    const members: Member[] = membersData?.map((m) => ({
        id: String(m.id),
        name: m.name,
        student_id: m.student_id || "N/A", // 映射数据库的下划线命名法到前端的驼峰或扁平字段
        role: m.role || "成员",
        department: m.department || "未分配",
        join_date: m.created_at || "N/A",  // 将数据库自动生成的 created_at 作为入社时间
        status: m.status || "活跃"
    })) || [];

    return <MembersClient initialMembers={members} />;
}
