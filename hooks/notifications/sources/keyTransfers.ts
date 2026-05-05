import { EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER } from "@/lib/duty/keyTransferFilters"

import type { AppNotification, NotificationSourceContext } from "../types"

export async function getKeyTransferNotifications({
    supabase,
    user,
    keyTransferReminder,
}: NotificationSourceContext): Promise<AppNotification[]> {
    if (!keyTransferReminder) return []

    const [incomingKeyTransfersResult, outgoingKeyTransfersResult] = await Promise.all([
        supabase
            .from("key_transfers")
            .select("id, note, created_at, from_member:members!key_transfers_from_member_id_fkey(name)")
            .eq("to_member_id", user.id)
            .eq("status", "pending")
            .or(EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER)
            .order("created_at", { ascending: false })
            .limit(6),
        supabase
            .from("key_transfers")
            .select("id, created_at, to_member:members!key_transfers_to_member_id_fkey(name)")
            .eq("from_member_id", user.id)
            .eq("status", "pending")
            .or(EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER)
            .order("created_at", { ascending: false })
            .limit(6),
    ])

    const items: AppNotification[] = []

    ;(incomingKeyTransfersResult.data || []).forEach((t: any) => {
        items.push({
            id: `key-transfer-in-${t.id}`,
            title: "待确认钥匙交接",
            description: `${t.from_member?.name || "成员"} 向你发起了钥匙交接${t.note ? `：${t.note}` : ""}`,
            href: "/",
            createdAt: t.created_at,
            level: "critical",
        })
    })

    ;(outgoingKeyTransfersResult.data || []).forEach((t: any) => {
        items.push({
            id: `key-transfer-out-${t.id}`,
            title: "钥匙交接待对方确认",
            description: `已移交给 ${t.to_member?.name || "成员"}，等待对方确认。`,
            href: "/",
            createdAt: t.created_at,
            level: "info",
        })
    })

    return items
}
