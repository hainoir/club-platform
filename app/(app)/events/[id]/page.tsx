import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CalendarIcon, MapPin, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// 增量静态再生成：该页面在服务端缓存 60 秒
export const revalidate = 60

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

    // 格式化日期
    const formattedDate = new Date(event.event_date).toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    })
    const formattedTime = new Date(event.event_date).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit'
    })
    const formattedEndTime = event.end_time ? new Date(event.end_time).toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit'
    }) : null

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
