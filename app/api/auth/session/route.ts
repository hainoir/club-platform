import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession()

    if (error || !session) {
        return NextResponse.json({ session: null }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json(
        {
            session: {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
            },
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
}
