import { createClient } from "@/utils/supabase/server"
import MembersClient, { Member } from "./MembersClient"

const DEPARTMENT_LABEL_MAP: Record<string, string> = {
    Design: "设计部",
    Development: "开发部",
    Photography: "摄影部",
    unassigned: "未分配",
}

const GRADE_LABEL_MAP: Record<string, string> = {
    Freshman: "大一",
    Sophomore: "大二",
    Junior: "大三",
    Senior: "大四",
}

function normalizeDepartment(value: string | null): string {
    if (!value) return "未分配"
    return DEPARTMENT_LABEL_MAP[value] || value
}

function normalizeGrade(value: string | null): string {
    if (!value) return ""
    return GRADE_LABEL_MAP[value] || value
}

function normalizeStudentId(value: string | number | null): string {
    if (value === null || value === undefined) return ""
    return String(value)
}

export default async function MembersPage() {
    const supabase = await createClient()

    const { data: membersData, error } = await supabase
        .from("members")
        .select("*")
        .order("id", { ascending: true })

    if (error) {
        console.error("获取成员数据失败:", error)
    }

    const members: Member[] =
        membersData?.map((m) => ({
            id: String(m.id),
            name: m.name,
            student_id: normalizeStudentId(m.student_id as string | number | null),
            role: m.role || "干事",
            department: normalizeDepartment(m.department),
            grade: normalizeGrade(m.grade),
            join_date: m.join_date || m.created_at || "",
            status: m.status || "active",
        })) || []

    return <MembersClient initialMembers={members} />
}
