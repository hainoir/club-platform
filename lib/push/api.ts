import "server-only"

import { NextResponse } from "next/server"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"

export interface AuthenticatedMember {
    id: string
    email: string
    role: string
}

export function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
}

export function isSameOriginRequest(request: Request): boolean {
    const origin = request.headers.get("origin")
    if (!origin) return true
    try {
        return new URL(origin).origin === new URL(request.url).origin
    } catch {
        return false
    }
}

export async function resolveAuthenticatedMember(): Promise<AuthenticatedMember | null> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()
    const byId = await admin.from("members").select("id, email, role").eq("id", user.id).maybeSingle()
    if (byId.data) return byId.data

    if (!user.email) return null
    const byEmail = await admin
        .from("members")
        .select("id, email, role")
        .ilike("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    return byEmail.data || null
}

export function isSafeEndpoint(value: unknown): value is string {
    if (typeof value !== "string" || value.length < 20 || value.length > 4096) return false
    try {
        return new URL(value).protocol === "https:"
    } catch {
        return false
    }
}

export function isSafePushKey(value: unknown, maxLength = 512): value is string {
    return typeof value === "string" && value.length >= 8 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value)
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback
}

export function getAdminClientOrResponse(): { admin: ReturnType<typeof createAdminClient>; response?: never } | { admin?: never; response: NextResponse } {
    try {
        return { admin: createAdminClient() }
    } catch {
        return { response: jsonError("手机通知服务尚未完成部署配置。", 503) }
    }
}
