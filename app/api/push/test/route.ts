import { NextResponse } from "next/server"

import { getAdminClientOrResponse, isSameOriginRequest, jsonError, resolveAuthenticatedMember } from "@/lib/push/api"

const TEST_INTERVAL_MS = 10 * 60 * 1000

export async function POST(request: Request) {
    if (!isSameOriginRequest(request)) return jsonError("请求来源无效。", 403)
    const member = await resolveAuthenticatedMember()
    if (!member) return jsonError("请先登录。", 401)

    const result = getAdminClientOrResponse()
    if (result.response) return result.response
    const { admin } = result
    const activeResult = await admin
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("member_id", member.id)
        .eq("status", "active")
    if (activeResult.error) return jsonError("无法检查设备订阅。", 500)
    if ((activeResult.count || 0) === 0) return jsonError("当前账号没有已启用的推送设备。", 409)

    const cutoff = new Date(Date.now() - TEST_INTERVAL_MS).toISOString()
    const recent = await admin
        .from("notification_outbox")
        .select("id")
        .eq("recipient_member_id", member.id)
        .eq("notification_type", "push_test")
        .gte("created_at", cutoff)
        .limit(1)
        .maybeSingle()
    if (recent.error) return jsonError("无法检查测试频率。", 500)
    if (recent.data) return jsonError("测试通知每 10 分钟最多发送一次。", 429)

    const now = new Date()
    const bucket = Math.floor(now.getTime() / TEST_INTERVAL_MS)
    const insert = await admin.from("notification_outbox").insert({
        recipient_member_id: member.id,
        notification_type: "push_test",
        entity_type: "member",
        entity_id: member.id,
        dedupe_key: `push-test:${member.id}:${bucket}`,
        title: "手机通知已连接",
        body: "社团平台可以向这台设备发送关键业务提醒。",
        target_url: "/settings#notifications",
        urgency: "normal",
        scheduled_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    })
    if (insert.error) return jsonError("创建测试通知失败。", 500)
    return NextResponse.json({ queued: true }, { status: 202 })
}
