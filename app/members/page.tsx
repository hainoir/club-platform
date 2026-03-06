import { createClient } from '@/utils/supabase/server';
import MembersClient, { Member } from './MembersClient';

export default async function MembersPage() {
    const supabase = await createClient();

    // 从 Supabase 的 members 表中查询所有社团成员数据
    const { data: membersData, error } = await supabase
        .from('members')
        .select('*')
        .order('id', { ascending: true }); // Assume 'id' column exists

    // 如果出错或没数据，你可以选择处理（比如传空数组进行容错或者显示错误）
    if (error) {
        console.error("获取成员数据失败:", error);
    }

    // 将数据库的数据映射为前端组件需要的结构
    const members: Member[] = membersData?.map((m) => ({
        id: String(m.id),
        name: m.name,
        student_id: m.student_id || "N/A", // Changed from studentId to student_id
        role: m.role || "成员",
        join_date: m.created_at || "N/A",  // Database usually defaults this to created_at
        status: m.status || "活跃"
    })) || [];

    return <MembersClient initialMembers={members} />;
}
