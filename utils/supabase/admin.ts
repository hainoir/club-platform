import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/types/supabase"

let adminClient: ReturnType<typeof createClient<Database>> | null = null

export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    if (!adminClient) {
        adminClient = createClient<Database>(url, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
            },
        })
    }

    return adminClient
}
