import * as React from "react"
import { CalendarIcon, MapPin, Clock, Users, Globe, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import Link from "next/link"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Event } from "@/app/events/EventsClient"

interface EventCardProps {
    event: Event
    isEnded: boolean
    isAdmin: boolean
    currentUserEmail?: string
    onEdit: (event: Event) => void
    onDelete: (id: string, title: string) => void
    onAttendeesClick: (event: Event) => void
    onRSVP: (event: Event) => void
}

export function EventCard({
    event,
    isEnded,
    isAdmin,
    currentUserEmail,
    onEdit,
    onDelete,
    onAttendeesClick,
    onRSVP
}: EventCardProps) {
    const isRSVPd = event.attendeesList?.some(a => a.user_email === currentUserEmail)

    return (
        <Card className={cn(
            "flex flex-col overflow-hidden bg-card/50 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800/60 shadow-sm transition-all hover:shadow-md",
            isEnded ? "opacity-70 grayscale-[30%]" : "hover:border-indigo-500/30"
        )}>
            <Link href={`/events/${event.id}`} className="block relative focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-t-xl group">
                {event.coverUrl ? (
                    <div className="w-full h-40 overflow-hidden bg-muted relative">
                        <img src={event.coverUrl} alt={event.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    </div>
                ) : (
                    <div className="w-full h-3 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20" />
                )}
            </Link>
            <CardHeader className={cn("pb-4", event.coverUrl ? "pt-4" : "")}>
                <div className="flex justify-between items-start mb-2">
                    <div className="flex gap-2 items-center">
                        <Badge variant={
                            event.type === "工作坊" ? "default" :
                                event.type === "讲座" ? "secondary" : "outline"
                        } className={event.type === "社交" ? "border-amber-500/50 text-amber-600 dark:text-amber-400" : ""}>
                            {event.type}
                        </Badge>
                        {event.isOnline && (
                            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50">
                                <Globe className="h-3 w-3" /> 线上
                            </Badge>
                        )}
                        {isEnded && (
                            <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">已结束</Badge>
                        )}
                    </div>
                    {isAdmin && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mt-2 -mr-2">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">打开菜单</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[160px]">
                                <DropdownMenuItem onClick={() => onEdit(event)}>
                                    <Pencil className="mr-2 h-4 w-4" /> 编辑活动
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:bg-destructive focus:text-destructive-foreground" onClick={() => onDelete(event.id, event.title)}>
                                    <Trash2 className="mr-2 h-4 w-4" /> 移除活动
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                <Link href={`/events/${event.id}`} className="hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
                    <CardTitle className="text-xl leading-tight">{event.title}</CardTitle>
                </Link>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
                <div className="text-sm text-foreground/80 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {event.description || '*暂无描述*'}
                    </ReactMarkdown>
                </div>
                <div className="space-y-2 mt-4 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-indigo-500 opacity-70" />
                        <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-indigo-500 opacity-70" />
                        <span>{event.time}{event.endTime ? ` - ${event.endTime}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-indigo-500 opacity-70" />
                        <span className="truncate">{event.location}</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="bg-slate-50/50 dark:bg-zinc-900/50 border-t p-4 flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center text-xs text-muted-foreground font-medium hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-2 -ml-2 transition-colors cursor-pointer"
                    onClick={() => onAttendeesClick(event)}
                >
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    {event.attendees} 人参加
                </Button>

                <Button
                    size="sm"
                    variant={isEnded ? "secondary" : isRSVPd ? "outline" : "secondary"}
                    onClick={isEnded ? undefined : () => onRSVP(event)}
                    className="transition-all"
                    disabled={isEnded}
                >
                    {isEnded ? "报名截止" : (isRSVPd ? "取消报名" : "立即报名")}
                </Button>
            </CardFooter>
        </Card>
    )
}
