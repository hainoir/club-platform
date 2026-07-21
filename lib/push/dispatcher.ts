import "server-only"

import { randomUUID } from "node:crypto"

import { isAdminRole } from "@/lib/app-user"
import { isDutyRequiredDate } from "@/lib/duty/china-public-holidays"
import { PERIOD_END_MINUTES, PERIOD_START_MINUTES } from "@/lib/duty/duty-constants"
import { getDutyPeriodByMinutes, toDutyDateTimeParts } from "@/lib/duty/duty-time"
import { formatDutySlot } from "@/hooks/notifications/notification-utils"
import { createAdminClient } from "@/utils/supabase/admin"
import { categoryEnabled } from "@/lib/push/preferences"
import { classifyPushFailure, sendWebPush } from "@/lib/push/server"
import { getPushRetryDelayMs } from "@/lib/push/policy"
import type { Database } from "@/types/supabase"
import type { WebPushPayload } from "@/types/push"

type AdminClient = ReturnType<typeof createAdminClient>
type OutboxRow = Database["public"]["Tables"]["notification_outbox"]["Row"]
type PreferenceRow = Database["public"]["Tables"]["notification_preferences"]["Row"]
type SubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"]
type DeliveryRow = Database["public"]["Tables"]["push_deliveries"]["Row"]

const MAX_BATCH_SIZE = 50
const MAX_ATTEMPTS = 5

interface DispatchStats {
    claimed: number
    sent: number
    retried: number
    failed: number
    suppressed: number
    expired: number
}

function zonedDateKeyMinutesToDate(dateKey: string, minutes: number): Date {
    const hours = Math.floor(minutes / 60)
    const minute = minutes % 60
    return new Date(`${dateKey}T${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`)
}

function retryAt(attempts: number): Date {
    return new Date(Date.now() + getPushRetryDelayMs(attempts))
}

function unique<T>(items: T[]): T[] {
    return Array.from(new Set(items))
}

async function enqueueDueDutyNotifications(admin: AdminClient, now: Date): Promise<number> {
    const dutyNow = toDutyDateTimeParts(now)
    if (!isDutyRequiredDate(dutyNow.dateKey) || dutyNow.dayOfWeek < 1 || dutyNow.dayOfWeek > 5) return 0

    const [rostersResult, leavesResult, logsResult] = await Promise.all([
        admin
            .from("duty_rosters")
            .select("id, member_id, day_of_week, period")
            .eq("day_of_week", dutyNow.dayOfWeek),
        admin
            .from("duty_leaves")
            .select("member_id, day_of_week, period, leave_date, expires_at, status")
            .eq("leave_date", dutyNow.dateKey)
            .eq("status", "approved"),
        admin
            .from("duty_logs")
            .select("member_id, sign_in_time")
            .eq("sign_in_date", dutyNow.dateKey)
            .eq("location_verified", true),
    ])

    if (rostersResult.error || leavesResult.error || logsResult.error) {
        throw new Error("Unable to query due duty notifications")
    }

    const leaveSlots = new Set(
        (leavesResult.data || []).map((leave) => `${leave.member_id}:${leave.day_of_week}:${leave.period}`)
    )
    const signedSlots = new Set(
        (logsResult.data || []).flatMap((log) => {
            const parts = toDutyDateTimeParts(log.sign_in_time)
            const period = getDutyPeriodByMinutes(parts.minutes)
            return period > 0 ? [`${log.member_id}:${period}`] : []
        })
    )

    const rows: Database["public"]["Tables"]["notification_outbox"]["Insert"][] = []
    for (const roster of rostersResult.data || []) {
        if (leaveSlots.has(`${roster.member_id}:${roster.day_of_week}:${roster.period}`)) continue

        const startMinutes = PERIOD_START_MINUTES[roster.period]
        const endMinutes = PERIOD_END_MINUTES[roster.period]
        if (startMinutes === undefined || endMinutes === undefined) continue
        const slotLabel = formatDutySlot(roster.day_of_week, roster.period)
        const minutesUntilStart = startMinutes - dutyNow.minutes

        if (minutesUntilStart >= 25 && minutesUntilStart <= 35) {
            const expiresAt = zonedDateKeyMinutesToDate(dutyNow.dateKey, startMinutes + 5)
            rows.push({
                recipient_member_id: roster.member_id,
                notification_type: "duty_upcoming_30m",
                entity_type: "duty_roster",
                entity_id: roster.id,
                dedupe_key: `duty:${roster.id}:${dutyNow.dateKey}:30m`,
                title: "值班即将开始",
                body: `${slotLabel} 将在约 30 分钟后开始。`,
                target_url: "/",
                urgency: "normal",
                scheduled_at: now.toISOString(),
                expires_at: expiresAt.toISOString(),
            })
        }

        const overdueMinutes = dutyNow.minutes - endMinutes
        if (overdueMinutes >= 10 && overdueMinutes <= 130 && !signedSlots.has(`${roster.member_id}:${roster.period}`)) {
            rows.push({
                recipient_member_id: roster.member_id,
                notification_type: "duty_overdue_10m",
                entity_type: "duty_roster",
                entity_id: roster.id,
                dedupe_key: `duty:${roster.id}:${dutyNow.dateKey}:overdue-10m`,
                title: "值班签到已逾期",
                body: `${slotLabel} 已结束超过 10 分钟，仍未检测到签到。`,
                target_url: "/",
                urgency: "high",
                scheduled_at: now.toISOString(),
                expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
            })
        }
    }

    if (rows.length === 0) return 0
    const insertResult = await admin
        .from("notification_outbox")
        .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    if (insertResult.error) throw new Error("Unable to enqueue due duty notifications")
    return rows.length
}

async function isCurrentAdmin(admin: AdminClient, memberId: string): Promise<boolean> {
    const result = await admin.from("members").select("role").eq("id", memberId).maybeSingle()
    return !!result.data && isAdminRole(result.data.role)
}

async function validateOutbox(admin: AdminClient, outbox: OutboxRow, now: Date): Promise<boolean> {
    if (new Date(outbox.expires_at).getTime() <= now.getTime()) return false

    if (outbox.notification_type === "push_test") return true

    if (outbox.notification_type === "key_transfer_created") {
        const result = await admin
            .from("key_transfers")
            .select("to_member_id, status")
            .eq("id", outbox.entity_id)
            .maybeSingle()
        return result.data?.status === "pending" && result.data.to_member_id === outbox.recipient_member_id
    }
    if (outbox.notification_type === "key_transfer_confirmed") {
        const result = await admin
            .from("key_transfers")
            .select("from_member_id, status")
            .eq("id", outbox.entity_id)
            .maybeSingle()
        return result.data?.status === "confirmed" && result.data.from_member_id === outbox.recipient_member_id
    }

    if (outbox.notification_type.startsWith("swap_")) {
        const result = await admin
            .from("duty_swaps")
            .select("requester_id, target_id, status")
            .eq("id", outbox.entity_id)
            .maybeSingle()
        const swap = result.data
        if (!swap) return false
        switch (outbox.notification_type) {
            case "swap_target_invited":
                return swap.status === "pending" && swap.target_id === outbox.recipient_member_id
            case "swap_accepted_requester":
                return swap.status === "accepted" && swap.requester_id === outbox.recipient_member_id
            case "swap_accepted_admin":
                return swap.status === "accepted" && (await isCurrentAdmin(admin, outbox.recipient_member_id))
            case "swap_approved_requester":
                return swap.status === "approved" && swap.requester_id === outbox.recipient_member_id
            case "swap_approved_target":
                return swap.status === "approved" && swap.target_id === outbox.recipient_member_id
            case "swap_returned_to_hall":
                return swap.status === "pending" && swap.target_id === null && swap.requester_id === outbox.recipient_member_id
            default:
                return false
        }
    }

    if (outbox.notification_type === "leave_pending_admin") {
        const [leaveResult, swapResult, adminMember] = await Promise.all([
            admin.from("duty_leaves").select("status, expires_at").eq("id", outbox.entity_id).maybeSingle(),
            admin.from("duty_swaps").select("id").eq("leave_id", outbox.entity_id).limit(1).maybeSingle(),
            isCurrentAdmin(admin, outbox.recipient_member_id),
        ])
        return (
            adminMember &&
            leaveResult.data?.status === "pending" &&
            new Date(leaveResult.data.expires_at).getTime() > now.getTime() &&
            !swapResult.data
        )
    }

    if (outbox.notification_type === "leave_approved") {
        const [leaveResult, swapResult] = await Promise.all([
            admin.from("duty_leaves").select("member_id, status").eq("id", outbox.entity_id).maybeSingle(),
            admin.from("duty_swaps").select("id").eq("leave_id", outbox.entity_id).eq("status", "approved").limit(1).maybeSingle(),
        ])
        return leaveResult.data?.status === "approved" && leaveResult.data.member_id === outbox.recipient_member_id && !swapResult.data
    }

    if (outbox.notification_type.startsWith("duty_")) {
        const roster = await admin
            .from("duty_rosters")
            .select("member_id")
            .eq("id", outbox.entity_id)
            .maybeSingle()
        return roster.data?.member_id === outbox.recipient_member_id
    }

    return false
}

async function setOutboxStatus(
    admin: AdminClient,
    outboxId: string,
    update: Database["public"]["Tables"]["notification_outbox"]["Update"]
) {
    const result = await admin.from("notification_outbox").update({
        ...update,
        worker_id: null,
        processing_started_at: null,
    }).eq("id", outboxId)
    if (result.error) throw new Error("Unable to update push outbox")
}

async function processOutbox(
    admin: AdminClient,
    outbox: OutboxRow,
    preferences: PreferenceRow | undefined,
    subscriptions: SubscriptionRow[],
    now: Date
): Promise<"sent" | "retry" | "failed" | "suppressed" | "expired"> {
    if (new Date(outbox.expires_at).getTime() <= now.getTime()) {
        await setOutboxStatus(admin, outbox.id, { status: "expired" })
        return "expired"
    }

    if (!(await validateOutbox(admin, outbox, now))) {
        await setOutboxStatus(admin, outbox.id, { status: "suppressed", last_error: "Business state no longer matches" })
        return "suppressed"
    }

    if (!preferences || !categoryEnabled(preferences, outbox.notification_type) || subscriptions.length === 0) {
        await setOutboxStatus(admin, outbox.id, { status: "suppressed", last_error: "Push disabled or no active subscription" })
        return "suppressed"
    }

    const deliveryResult = await admin
        .from("push_deliveries")
        .upsert(
            subscriptions.map((subscription) => ({
                outbox_id: outbox.id,
                subscription_id: subscription.id,
            })),
            { onConflict: "outbox_id,subscription_id", ignoreDuplicates: true }
        )
    if (deliveryResult.error) throw new Error("Unable to prepare push deliveries")

    const existingDeliveriesResult = await admin
        .from("push_deliveries")
        .select("*")
        .eq("outbox_id", outbox.id)
    if (existingDeliveriesResult.error) throw new Error("Unable to load push deliveries")

    const deliveryBySubscription = new Map<string, DeliveryRow>(
        (existingDeliveriesResult.data || []).map((delivery) => [delivery.subscription_id, delivery])
    )
    let accepted = 0
    let transientFailures = 0
    let permanentFailures = 0

    for (const subscription of subscriptions) {
        const delivery = deliveryBySubscription.get(subscription.id)
        if (delivery?.status === "accepted") {
            accepted += 1
            continue
        }

        const payload: WebPushPayload = {
            notificationId: outbox.id,
            title: outbox.title,
            body: outbox.body,
            url: outbox.target_url,
            tag: outbox.dedupe_key,
            level: outbox.urgency === "high" ? "critical" : "info",
        }
        const ttlSeconds = Math.max(0, Math.floor((new Date(outbox.expires_at).getTime() - Date.now()) / 1000))

        try {
            const response = await sendWebPush(subscription, payload, {
                ttlSeconds,
                urgency: outbox.urgency,
            })
            accepted += 1
            await Promise.all([
                admin.from("push_deliveries").update({
                    status: "accepted",
                    attempts: (delivery?.attempts || 0) + 1,
                    response_status: response.statusCode,
                    error_message: null,
                    sent_at: new Date().toISOString(),
                    next_attempt_at: null,
                }).eq("outbox_id", outbox.id).eq("subscription_id", subscription.id),
                admin.from("push_subscriptions").update({
                    status: "active",
                    failure_count: 0,
                    last_success_at: new Date().toISOString(),
                }).eq("id", subscription.id),
            ])
        } catch (error) {
            const failure = classifyPushFailure(error)
            const nextDeliveryAttempt = (delivery?.attempts || 0) + 1
            if (failure.subscriptionExpired) {
                permanentFailures += 1
                await Promise.all([
                    admin.from("push_deliveries").update({
                        status: "subscription_expired",
                        attempts: nextDeliveryAttempt,
                        response_status: failure.statusCode,
                        error_message: failure.message,
                        next_attempt_at: null,
                    }).eq("outbox_id", outbox.id).eq("subscription_id", subscription.id),
                    admin.from("push_subscriptions").update({
                        status: "expired",
                        failure_count: subscription.failure_count + 1,
                        last_failure_at: new Date().toISOString(),
                    }).eq("id", subscription.id),
                ])
            } else if (failure.transient && outbox.attempts < MAX_ATTEMPTS) {
                transientFailures += 1
                const next = retryAt(outbox.attempts)
                await Promise.all([
                    admin.from("push_deliveries").update({
                        status: "retry",
                        attempts: nextDeliveryAttempt,
                        response_status: failure.statusCode,
                        error_message: failure.message,
                        next_attempt_at: next.toISOString(),
                    }).eq("outbox_id", outbox.id).eq("subscription_id", subscription.id),
                    admin.from("push_subscriptions").update({
                        failure_count: subscription.failure_count + 1,
                        last_failure_at: new Date().toISOString(),
                    }).eq("id", subscription.id),
                ])
            } else {
                permanentFailures += 1
                await Promise.all([
                    admin.from("push_deliveries").update({
                        status: "failed",
                        attempts: nextDeliveryAttempt,
                        response_status: failure.statusCode,
                        error_message: failure.message,
                        next_attempt_at: null,
                    }).eq("outbox_id", outbox.id).eq("subscription_id", subscription.id),
                    admin.from("push_subscriptions").update({
                        status: "error",
                        failure_count: subscription.failure_count + 1,
                        last_failure_at: new Date().toISOString(),
                    }).eq("id", subscription.id),
                ])
            }
        }
    }

    if (accepted > 0) {
        await setOutboxStatus(admin, outbox.id, { status: "sent", sent_at: new Date().toISOString(), next_attempt_at: null })
        return "sent"
    }

    if (transientFailures > 0 && outbox.attempts < MAX_ATTEMPTS) {
        const next = retryAt(outbox.attempts)
        if (next.getTime() < new Date(outbox.expires_at).getTime()) {
            await setOutboxStatus(admin, outbox.id, { status: "retry", next_attempt_at: next.toISOString(), last_error: "Transient push failure" })
            return "retry"
        }
    }

    await setOutboxStatus(admin, outbox.id, {
        status: "failed",
        next_attempt_at: null,
        last_error: permanentFailures > 0 ? "All device deliveries failed" : "Push retry window expired",
    })
    return "failed"
}

export async function dispatchPushBatch(batchSize = MAX_BATCH_SIZE): Promise<DispatchStats & { dutyCandidates: number }> {
    const admin = createAdminClient()
    const now = new Date()
    const dutyCandidates = await enqueueDueDutyNotifications(admin, now)
    const workerId = `vercel-${randomUUID()}`
    const claimResult = await admin.rpc("claim_push_outbox", {
        p_batch_size: Math.min(Math.max(batchSize, 1), MAX_BATCH_SIZE),
        p_worker_id: workerId,
    })
    if (claimResult.error) throw new Error(`Unable to claim push outbox: ${claimResult.error.message}`)

    const outboxRows = (claimResult.data || []) as OutboxRow[]
    const memberIds = unique(outboxRows.map((row) => row.recipient_member_id))
    const [preferencesResult, subscriptionsResult] = memberIds.length > 0
        ? await Promise.all([
              admin.from("notification_preferences").select("*").in("member_id", memberIds),
              admin.from("push_subscriptions").select("*").in("member_id", memberIds).eq("status", "active"),
          ])
        : [{ data: [], error: null }, { data: [], error: null }]

    if (preferencesResult.error || subscriptionsResult.error) {
        throw new Error("Unable to load push recipients")
    }

    const preferenceByMember = new Map<string, PreferenceRow>(
        ((preferencesResult.data || []) as PreferenceRow[]).map((preference) => [preference.member_id, preference])
    )
    const subscriptionsByMember = new Map<string, SubscriptionRow[]>()
    for (const subscription of (subscriptionsResult.data || []) as SubscriptionRow[]) {
        const group = subscriptionsByMember.get(subscription.member_id) || []
        group.push(subscription)
        subscriptionsByMember.set(subscription.member_id, group)
    }

    const stats: DispatchStats = { claimed: outboxRows.length, sent: 0, retried: 0, failed: 0, suppressed: 0, expired: 0 }
    for (const outbox of outboxRows) {
        try {
            const result = await processOutbox(
                admin,
                outbox,
                preferenceByMember.get(outbox.recipient_member_id),
                subscriptionsByMember.get(outbox.recipient_member_id) || [],
                now
            )
            if (result === "sent") stats.sent += 1
            else if (result === "retry") stats.retried += 1
            else if (result === "failed") stats.failed += 1
            else if (result === "suppressed") stats.suppressed += 1
            else stats.expired += 1
        } catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 500) : "Unhandled dispatcher error"
            const next = retryAt(outbox.attempts)
            const finalStatus = outbox.attempts < MAX_ATTEMPTS && next < new Date(outbox.expires_at) ? "retry" : "failed"
            await setOutboxStatus(admin, outbox.id, {
                status: finalStatus,
                next_attempt_at: next < new Date(outbox.expires_at) ? next.toISOString() : null,
                last_error: message,
            })
            if (finalStatus === "retry") stats.retried += 1
            else stats.failed += 1
        }
    }

    return { ...stats, dutyCandidates }
}
