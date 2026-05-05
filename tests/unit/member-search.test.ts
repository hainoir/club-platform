import assert from "node:assert/strict"
import test from "node:test"

import { filterAndSortMembers } from "../../hooks/members/member-search.ts"

const members = [
    {
        id: "1",
        name: "王五",
        student_id: "20240003",
        role: "干事",
        department: "开发部",
        grade: "2024",
        join_date: "2024-03-01",
        status: "active",
    },
    {
        id: "2",
        name: "李雷",
        student_id: "20240001",
        role: "主席",
        department: "设计部",
        grade: "2023",
        join_date: "2024-01-01",
        status: "inactive",
    },
    {
        id: "3",
        name: "韩梅梅",
        student_id: null,
        role: "部长",
        department: undefined,
        grade: undefined,
        join_date: undefined,
        status: "active",
    },
]

test("filters members by name or student id", () => {
    const byName = filterAndSortMembers(members, "李", { key: null, direction: null })
    assert.deepEqual(byName.map((member) => member.name), ["李雷"])

    const byStudentId = filterAndSortMembers(members, "20240003", { key: null, direction: null })
    assert.deepEqual(byStudentId.map((member) => member.name), ["王五"])
})

test("sorts known roles by configured priority", () => {
    const result = filterAndSortMembers(members, "", { key: "role", direction: "asc" })
    assert.deepEqual(result.map((member) => member.role), ["主席", "部长", "干事"])
})

test("sorts dates and keeps empty values last", () => {
    const result = filterAndSortMembers(members, "", { key: "join_date", direction: "desc" })
    assert.deepEqual(result.map((member) => member.name), ["王五", "李雷", "韩梅梅"])
})
