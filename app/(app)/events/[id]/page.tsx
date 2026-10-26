import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CalendarIcon, MapPin, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { EventDetailActions } from "@/components/events/EventDetailActions"
import type { Event } from "@/components/events/EventsClient"
import { formatEventDateTime } from "@/lib/events/event-time"
import { resolveAppUser } from "@/utils/supabase/resolve-app-user"

// RSVP state is user-specific, so this page must render against the current session.
export const dynamic = 'force-dynamic'

interface EventPageProps {
    params: Promise<{ id: string }>
}

export default async function EventPage({ params }: EventPageProps) {
    const { id } = await params
    const supabase = await createClient()

    const { data: event, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !event) {
        notFound()
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const appUser = await resolveAppUser(supabase, authUser)
    const { data: memberAttendee } = appUser?.id
        ? await supabase
            .from('event_attendees')
            .select('id, member_id, user_name, user_email')
            .eq('event_id', id)
            .eq('member_id', appUser.id)
            .maybeSingle()
        : { data: null }
    const { data: legacyAttendee } = !memberAttendee && appUser?.email
        ? await supabase
            .from('event_attendees')
            .select('id, member_id, user_name, user_email')
            .eq('event_id', id)
            .is('member_id', null)
            .ilike('user_email', appUser.email)
            .maybeSingle()
        : { data: null }
    const currentAttendee = memberAttendee || legacyAttendee

    // 格式化日期
    const formattedDate = formatEventDateTime(event.event_date, {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    })
    const formattedTime = formatEventDateTime(event.event_date, {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    })
    const formattedEndTime = event.end_time ? formatEventDateTime(event.end_time, {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }) : null

    const detailEvent: Event = {
        id: String(event.id),
        title: event.title,
        date: formattedDate,
        time: formattedTime,
        endTime: formattedEndTime || undefined,
        rawDate: event.event_date,
        rawEndTime: event.end_time,
        location: event.location || "待定",
        isOnline: event.is_online,
        description: event.description || "",
        attendees: 0,
        attendeesList: currentAttendee ? [currentAttendee] : [],
        type: event.type || "讲座",
        coverUrl: event.cover_url || undefined,
    }
    const isEnded = new Date(event.end_time || event.event_date).getTime() < Date.now()

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {event.cover_url ? (
                <div className="w-full h-64 md:h-96 rounded-2xl overflow-hidden bg-muted mb-8 shadow-md">
                    <img src={event.cover_url} alt={event.title} className="w-full h-full object-cover" />
                </div>
            ) : (
                <div className="w-full h-32 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 mb-8" />
            )}

            <div className="flex flex-col gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <Badge variant="secondary" className="text-sm px-3 py-1">
                            {event.type}
                        </Badge>
                        {event.is_online && (
                            <Badge variant="outline" className="text-sm px-3 py-1 border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50">
                                线上活动
                            </Badge>
                        )}
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight mb-4">{event.title}</h1>

                    <div className="flex flex-wrap gap-6 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-slate-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-5 w-5 text-indigo-500" />
                            <span className="font-medium">{formattedDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-indigo-500" />
                            <span className="font-medium">{formattedTime}{formattedEndTime ? ` - ${formattedEndTime}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-indigo-500" />
                            <span className="font-medium">{event.location}</span>
                        </div>
                    </div>
                    <div className="mt-5">
                        <EventDetailActions event={detailEvent} initialIsRSVPd={!!currentAttendee} isEnded={isEnded} />
                    </div>
                </div>

                <div className="prose prose-slate dark:prose-invert max-w-none w-full bg-white dark:bg-zinc-950 p-6 md:p-8 rounded-2xl border shadow-sm mt-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {event.description || '*该活动暂无长篇介绍。*'}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    )
}
