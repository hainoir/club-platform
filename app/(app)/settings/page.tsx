import { createClient } from "@/utils/supabase/server"
import SettingsClient, { SettingsProfile } from "./SettingsClient"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    let profile: SettingsProfile | null = null

    if (user?.email) {
        const { data: memberData } = await supabase
            .from("members")
            .select("id, email, name, role, department, grade, student_id")
            .eq("email", user.email)
            .single()

        if (memberData) {
            profile = {
                id: memberData.id,
                email: memberData.email,
                name: memberData.name || user.user_metadata?.name || "社团成员",
                role: memberData.role,
                department: memberData.department || user.user_metadata?.department || null,
                grade: memberData.grade || user.user_metadata?.grade || null,
                studentId:
                    memberData.student_id === null || memberData.student_id === undefined
                        ? (user.user_metadata?.student_id ? String(user.user_metadata.student_id) : null)
                        : String(memberData.student_id),
            }
        } else {
            profile = {
                id: user.id,
                email: user.email || "",
                name: user.user_metadata?.name || "社团成员",
                role: "member",
                department: user.user_metadata?.department || null,
                grade: user.user_metadata?.grade || null,
                studentId: user.user_metadata?.student_id ? String(user.user_metadata.student_id) : null,
            }
        }
    }

    return <SettingsClient profile={profile} />
}
