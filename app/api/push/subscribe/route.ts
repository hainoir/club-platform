import { NextResponse } from "next/server"

import {
    asBoolean,
    getAdminClientOrResponse,
    isSafeEndpoint,
    isSafePushKey,
    isSameOriginRequest,
    jsonError,
    resolveAuthenticatedMember,
} from "@/lib/push/api"
import type { SubscribePushRequest } from "@/types/push"

export async function POST(request: Request) {
    if (!isSameOriginRequest(request)) return jsonError("请求来源无效。", 403)
    const member = await resolveAuthenticatedMember()
    if (!member) return jsonError("请先登录。", 401)

    const result = getAdminClientOrResponse()
    if (result.response) return result.response
    const { admin } = result
    const body = (await request.json().catch(() => null)) as SubscribePushRequest | null
    const endpoint = body?.subscription?.endpoint
    const p256dh = body?.subscription?.keys?.p256dh
    const auth = body?.subscription?.keys?.auth

    if (!isSafeEndpoint(endpoint) || !isSafePushKey(p256dh) || !isSafePushKey(auth)) {
        return jsonError("推送订阅参数无效。", 400)
    }

    const existing = await admin.from("push_subscriptions").select("id, member_id").eq("endpoint", endpoint).maybeSingle()
    if (existing.error) return jsonError("无法检查设备订阅。", 500)
    if (existing.data && existing.data.member_id !== member.id) {
        await admin.from("push_subscriptions").update({ status: "revoked" }).eq("id", existing.data.id)
        await admin.from("push_subscriptions").delete().eq("id", existing.data.id)
    }

    const subscriptionResult = await admin
        .from("push_subscriptions")
        .upsert(
            {
                member_id: member.id,
                endpoint,
                p256dh,
                auth,
                user_agent: body?.device?.userAgent?.slice(0, 1000) || request.headers.get("user-agent"),
                platform: body?.device?.platform?.slice(0, 120) || null,
                device_label: body?.device?.label?.slice(0, 120) || "浏览器设备",
                status: "active",
                failure_count: 0,
                last_failure_at: null,
            },
            { onConflict: "endpoint" }
        )
        .select("id")
        .single()
    if (subscriptionResult.error) return jsonError("保存设备订阅失败。", 500)

    const currentPreferencesResult = await admin
        .from("notification_preferences")
        .select("*")
        .eq("member_id", member.id)
        .maybeSingle()
    if (currentPreferencesResult.error) return jsonError("无法读取通知偏好。", 500)

    const preferences = body?.preferences
    const currentPreferences = currentPreferencesResult.data
    const preferencesResult = await admin.from("notification_preferences").upsert(
        {
            member_id: member.id,
            in_app_enabled: asBoolean(preferences?.inAppEnabled, currentPreferences?.in_app_enabled ?? true),
            web_push_enabled: true,
            duty_reminder: asBoolean(preferences?.dutyReminder, currentPreferences?.duty_reminder ?? true),
            key_transfer_reminder: asBoolean(preferences?.keyTransferReminder, currentPreferences?.key_transfer_reminder ?? true),
            leave_reminder: asBoolean(preferences?.leaveReminder, currentPreferences?.leave_reminder ?? true),
            swap_reminder: asBoolean(preferences?.swapReminder, currentPreferences?.swap_reminder ?? true),
            event_reminder: asBoolean(preferences?.eventReminder, currentPreferences?.event_reminder ?? true),
        },
        { onConflict: "member_id" }
    )
    if (preferencesResult.error) return jsonError("保存通知偏好失败。", 500)

    const countResult = await admin
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("member_id", member.id)
        .eq("status", "active")

    return NextResponse.json({ subscriptionId: subscriptionResult.data.id, activeDeviceCount: countResult.count || 1 })
}

export async function DELETE(request: Request) {
    if (!isSameOriginRequest(request)) return jsonError("请求来源无效。", 403)
    const member = await resolveAuthenticatedMember()
    if (!member) return jsonError("请先登录。", 401)

    const result = getAdminClientOrResponse()
    if (result.response) return result.response
    const { admin } = result
    const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown }
    if (!isSafeEndpoint(body.endpoint)) return jsonError("设备订阅参数无效。", 400)

    const updateResult = await admin
        .from("push_subscriptions")
        .update({ status: "revoked" })
        .eq("member_id", member.id)
        .eq("endpoint", body.endpoint)
    if (updateResult.error) return jsonError("停用设备失败。", 500)

    const countResult = await admin
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("member_id", member.id)
        .eq("status", "active")
    if ((countResult.count || 0) === 0) {
        await admin.from("notification_preferences").update({ web_push_enabled: false }).eq("member_id", member.id)
    }

    return NextResponse.json({ activeDeviceCount: countResult.count || 0 })
}
