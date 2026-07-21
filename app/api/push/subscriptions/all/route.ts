import { NextResponse } from "next/server"

import { getAdminClientOrResponse, isSameOriginRequest, jsonError, resolveAuthenticatedMember } from "@/lib/push/api"

export async function DELETE(request: Request) {
    if (!isSameOriginRequest(request)) return jsonError("请求来源无效。", 403)
    const member = await resolveAuthenticatedMember()
    if (!member) return jsonError("请先登录。", 401)

    const result = getAdminClientOrResponse()
    if (result.response) return result.response
    const { admin } = result
    const [subscriptionsResult, preferencesResult] = await Promise.all([
        admin.from("push_subscriptions").update({ status: "revoked" }).eq("member_id", member.id).eq("status", "active"),
        admin.from("notification_preferences").update({ web_push_enabled: false }).eq("member_id", member.id),
    ])
    if (subscriptionsResult.error || preferencesResult.error) return jsonError("停用全部设备失败。", 500)
    return NextResponse.json({ activeDeviceCount: 0 })
}
