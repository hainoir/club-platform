import type { createClient } from "@/utils/supabase/client"

export interface SettingsProfile {
    id: string
    email: string
    name: string
    role: string
    department: string | null
    grade: string | null
    studentId: string | null
}

export const TAB_VALUES = ["notifications", "interface", "account", "security"] as const

export type TabValue = (typeof TAB_VALUES)[number]

export type SettingsSupabaseClient = ReturnType<typeof createClient>
