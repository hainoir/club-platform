import { NextResponse } from "next/server"

import { asBoolean, getAdminClientOrResponse, isSameOriginRequest, jsonError, resolveAuthenticatedMember } from "@/lib/push/api"
import { DEFAULT_SERVER_NOTIFICATION_PREFERENCES, toServerPreferences } from "@/lib/push/preferences"

export async function PATCH(request: Request) {
    if (!isSameOriginRequest(request)) return jsonError("请求来源无效。", 403)
    const member = await resolveAuthenticatedMember()
    if (!member) return jsonError("请先登录。", 401)

    const result = getAdminClientOrResponse()
    if (result.response) return result.response
    const { admin } = result
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    const currentResult = await admin.from("notification_preferences").select("*").eq("member_id", member.id).maybeSingle()
    if (currentResult.error) return jsonError("无法读取通知偏好。", 500)
    const current = toServerPreferences(currentResult.data)

    const upsertResult = await admin
        .from("notification_preferences")
        .upsert(
            {
                member_id: member.id,
                in_app_enabled: asBoolean(body.inAppEnabled, current.inAppEnabled),
                web_push_enabled: currentResult.data?.web_push_enabled ?? DEFAULT_SERVER_NOTIFICATION_PREFERENCES.webPushEnabled,
                duty_reminder: asBoolean(body.dutyReminder, current.dutyReminder),
                key_transfer_reminder: asBoolean(body.keyTransferReminder, current.keyTransferReminder),
                leave_reminder: asBoolean(body.leaveReminder, current.leaveReminder),
                swap_reminder: asBoolean(body.swapReminder, current.swapReminder),
                event_reminder: asBoolean(body.eventReminder, current.eventReminder),
            },
            { onConflict: "member_id" }
        )
        .select("*")
        .single()

    if (upsertResult.error) return jsonError("保存通知偏好失败。", 500)
    return NextResponse.json({ preferences: toServerPreferences(upsertResult.data) })
}
