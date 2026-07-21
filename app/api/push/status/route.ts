import { NextResponse } from "next/server"

import { getAdminClientOrResponse, jsonError, resolveAuthenticatedMember } from "@/lib/push/api"
import { toServerPreferences } from "@/lib/push/preferences"

export const dynamic = "force-dynamic"

export async function GET() {
    const member = await resolveAuthenticatedMember()
    if (!member) return jsonError("请先登录。", 401)

    const result = getAdminClientOrResponse()
    if (result.response) return result.response
    const { admin } = result

    const [preferencesResult, devicesResult, lastTestResult] = await Promise.all([
        admin.from("notification_preferences").select("*").eq("member_id", member.id).maybeSingle(),
        admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("member_id", member.id).eq("status", "active"),
        admin
            .from("notification_outbox")
            .select("created_at")
            .eq("recipient_member_id", member.id)
            .eq("notification_type", "push_test")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])

    if (preferencesResult.error || devicesResult.error || lastTestResult.error) {
        return jsonError("无法读取手机通知状态。", 500)
    }

    return NextResponse.json(
        {
            activeDeviceCount: devicesResult.count || 0,
            lastTestAt: lastTestResult.data?.created_at || null,
            hasPreferences: !!preferencesResult.data,
            preferences: toServerPreferences(preferencesResult.data),
        },
        { headers: { "Cache-Control": "no-store" } }
    )
}
