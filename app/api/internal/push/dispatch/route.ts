import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

import { dispatchPushBatch } from "@/lib/push/dispatcher"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(request: Request): boolean {
    const secret = process.env.PUSH_DISPATCH_SECRET
    const header = request.headers.get("authorization")
    if (!secret || !header?.startsWith("Bearer ")) return false
    const supplied = header.slice("Bearer ".length)
    const expectedBuffer = Buffer.from(secret)
    const suppliedBuffer = Buffer.from(supplied)
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer)
}

export async function POST(request: Request) {
    if (!process.env.PUSH_DISPATCH_SECRET) {
        return NextResponse.json({ error: "Push dispatcher is not configured" }, { status: 503 })
    }
    if (!authorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const stats = await dispatchPushBatch()
        return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Push dispatch failed"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
