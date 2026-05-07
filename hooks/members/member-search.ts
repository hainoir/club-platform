import type { Member } from "@/components/members/MembersClient"

export type MemberSortKey = "name" | "student_id" | "role" | "department" | "grade" | "join_date" | "status"
export type MemberSortDirection = "asc" | "desc" | null

export type MemberSortConfig = {
    key: MemberSortKey | null
    direction: MemberSortDirection
}

export const DEFAULT_SORT_CONFIG: MemberSortConfig = {
    key: null,
    direction: null,
}

const ROLE_SORT_PRIORITY: Record<string, number> = {
    "执行主席": 0,
    "主席": 1,
    "副主席": 2,
    "部长": 3,
    "干事": 4,
    "管理员": 5,
    admin: 5,
    "成员": 6,
    member: 6,
}

function normalizeSearchValue(value: unknown): string {
    if (value === null || value === undefined) return ""
    return String(value).trim().toLowerCase()
}

function compareText(left: string, right: string): number {
    return left.localeCompare(right, "zh-CN", {
        numeric: true,
        sensitivity: "base",
    })
}

function compareNullableText(left: unknown, right: unknown, direction: Exclude<MemberSortDirection, null>): number {
    const normalizedLeft = normalizeSearchValue(left)
    const normalizedRight = normalizeSearchValue(right)

    if (!normalizedLeft && !normalizedRight) return 0
    if (!normalizedLeft) return 1
    if (!normalizedRight) return -1

    return direction === "asc"
        ? compareText(normalizedLeft, normalizedRight)
        : compareText(normalizedRight, normalizedLeft)
}

function parseDateValue(value: string | undefined): number | null {
    if (!value) return null

    const timestamp = new Date(value).getTime()
    return Number.isNaN(timestamp) ? null : timestamp
}

function compareNullableNumber(left: number | null, right: number | null, direction: Exclude<MemberSortDirection, null>): number {
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1

    return direction === "asc" ? left - right : right - left
}

function resolveRoleSortPriority(role: string | undefined): number | null {
    const normalizedRole = normalizeSearchValue(role)
    if (!normalizedRole) return null
    return ROLE_SORT_PRIORITY[normalizedRole] ?? null
}

function compareRole(leftRole: string | undefined, rightRole: string | undefined, direction: Exclude<MemberSortDirection, null>): number {
    const leftPriority = resolveRoleSortPriority(leftRole)
    const rightPriority = resolveRoleSortPriority(rightRole)

    if (leftPriority !== null || rightPriority !== null) {
        if (leftPriority === null) return 1
        if (rightPriority === null) return -1

        if (leftPriority !== rightPriority) {
            return direction === "asc" ? leftPriority - rightPriority : rightPriority - leftPriority
        }
    }

    return compareNullableText(leftRole, rightRole, direction)
}

function compareMembers(
    left: Member,
    right: Member,
    sortConfig: { key: MemberSortKey; direction: Exclude<MemberSortDirection, null> }
): number {
    let result = 0

    switch (sortConfig.key) {
        case "name":
            result = compareNullableText(left.name, right.name, sortConfig.direction)
            break
        case "student_id":
            result = compareNullableText(left.student_id, right.student_id, sortConfig.direction)
            break
        case "role":
            result = compareRole(left.role, right.role, sortConfig.direction)
            break
        case "department":
            result = compareNullableText(left.department, right.department, sortConfig.direction)
            break
        case "grade":
            result = compareNullableText(left.grade, right.grade, sortConfig.direction)
            break
        case "join_date":
            result = compareNullableNumber(parseDateValue(left.join_date), parseDateValue(right.join_date), sortConfig.direction)
            break
        case "status":
            result = compareNullableText(left.status, right.status, sortConfig.direction)
            break
    }

    if (result !== 0) return result

    const byName = compareNullableText(left.name, right.name, "asc")
    if (byName !== 0) return byName

    return compareNullableText(left.student_id, right.student_id, "asc")
}

export function filterAndSortMembers(
    members: Member[],
    query: string,
    sortConfig: MemberSortConfig
): Member[] {
    const normalizedQuery = query.trim().toLowerCase()
    const filteredMembers = normalizedQuery
        ? members.filter((member) => {
              const normalizedName = normalizeSearchValue(member.name)
              const normalizedStudentId = normalizeSearchValue(member.student_id)
              return normalizedName.includes(normalizedQuery) || normalizedStudentId.includes(normalizedQuery)
          })
        : members

    if (!sortConfig.key || !sortConfig.direction) {
        return filteredMembers
    }

    const activeSortConfig: { key: MemberSortKey; direction: Exclude<MemberSortDirection, null> } = {
        key: sortConfig.key,
        direction: sortConfig.direction,
    }

    return [...filteredMembers].sort((left, right) => compareMembers(left, right, activeSortConfig))
}
