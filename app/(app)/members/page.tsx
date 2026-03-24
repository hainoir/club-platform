import { createClient } from "@/utils/supabase/server"
import { normalizeDepartmentForStorage, normalizeGradeValue } from "@/utils/profile-fields"
import MembersClient, { Member } from "./MembersClient"

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
            department: normalizeDepartmentForStorage(m.department),
            grade: normalizeGradeValue(m.grade) || "",
            join_date: m.join_date || m.created_at || "",
            status: m.status || "active",
        })) || []

    return <MembersClient initialMembers={members} />
}
