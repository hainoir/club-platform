export interface ProfileOption {
    value: string
    label: string
}

export const DEPARTMENT_OPTIONS: ProfileOption[] = [
    { value: "设计部", label: "设计部" },
    { value: "开发部", label: "开发部" },
    { value: "摄影部", label: "摄影部" },
]

export const GRADE_OPTIONS: ProfileOption[] = [
    { value: "大一", label: "大一" },
    { value: "大二", label: "大二" },
    { value: "大三", label: "大三" },
    { value: "大四", label: "大四" },
]

const DEPARTMENT_ALIAS_MAP: Record<string, string> = {
    Design: "设计部",
    design: "设计部",
    Development: "开发部",
    development: "开发部",
    Photography: "摄影部",
    photography: "摄影部",
    unassigned: "未分配",
    Unassigned: "未分配",
    "设计部": "设计部",
    "开发部": "开发部",
    "摄影部": "摄影部",
    "未分配": "未分配",
}

const GRADE_ALIAS_MAP: Record<string, string> = {
    Freshman: "大一",
    freshman: "大一",
    Sophomore: "大二",
    sophomore: "大二",
    Junior: "大三",
    junior: "大三",
    Senior: "大四",
    senior: "大四",
    "大一": "大一",
    "大二": "大二",
    "大三": "大三",
    "大四": "大四",
}

function normalizeText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

export function normalizeDepartmentValue(value: string | null | undefined): string | null {
    const normalized = normalizeText(value)
    if (!normalized) return null
    return DEPARTMENT_ALIAS_MAP[normalized] || normalized
}

export function normalizeDepartmentForStorage(value: string | null | undefined): string {
    return normalizeDepartmentValue(value) || "未分配"
}

export function normalizeGradeValue(value: string | null | undefined): string | null {
    const normalized = normalizeText(value)
    if (!normalized) return null
    return GRADE_ALIAS_MAP[normalized] || normalized
}
