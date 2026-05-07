import type { Member } from "@/components/members/MembersClient"

export function exportMembersToCSV(members: Member[]): boolean {
    if (members.length === 0) {
        return false
    }

    const BOM = "\uFEFF"
    const header = ["姓名", "学号", "角色", "部门", "年级", "加入日期", "状态"].join(",")

    const rows = members.map((member) => {
        const student_id = member.student_id ? `"${member.student_id}"` : "-"
        const role = member.role === "admin" ? "管理员" : member.role === "member" ? "成员" : member.role
        const join_date = member.join_date ? new Date(member.join_date).toLocaleDateString("zh-CN") : "-"
        const status = member.status === "active" ? "活跃" : member.status === "inactive" ? "停用" : "未知"
        const department = member.department || "未分配"
        const grade = member.grade || "未设置"

        return `"${member.name}",${student_id},"${role}","${department}","${grade}","${join_date}","${status}"`
    })

    const csvContent = BOM + [header, ...rows].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.setAttribute("download", `社团成员名单_${new Date().toLocaleDateString("zh-CN")}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    return true
}
