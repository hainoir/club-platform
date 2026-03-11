import { createClient } from '@/utils/supabase/server';
import MembersClient, { Member } from './MembersClient';

const DEPARTMENT_LABEL_MAP: Record<string, string> = {
    Design: '设计部',
    Development: '开发部',
    Photography: '摄影部',
    unassigned: '未分配',
};

const GRADE_LABEL_MAP: Record<string, string> = {
    Freshman: '大一',
    Sophomore: '大二',
    Junior: '大三',
    Senior: '大四',
};

function normalizeDepartment(value: string | null): string {
    if (!value) return '未分配';
    return DEPARTMENT_LABEL_MAP[value] || value;
}

function normalizeGrade(value: string | null): string {
    if (!value) return '';
    return GRADE_LABEL_MAP[value] || value;
}

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
        student_id: m.student_id || '-',
        role: m.role || '干事',
        department: normalizeDepartment(m.department),
        grade: normalizeGrade(m.grade),
        join_date: m.join_date || m.created_at || '',
        status: m.status || 'active',
    })) || [];

    return <MembersClient initialMembers={members} />;
}
