import * as React from "react"

import { createClient } from "@/utils/supabase/client"

export type SupabaseBrowserClient = ReturnType<typeof createClient>

export function useSupabase(): SupabaseBrowserClient {
    return React.useMemo(() => createClient(), [])
}
