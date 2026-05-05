'use client';

import { BookOpen, Loader2, MapPin, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useStudioPresence } from '@/hooks/studio/useStudioPresence';
import { cn } from '@/lib/utils';

import type { RosterWithMember } from '@/hooks/useDuty';

interface StudioMembersCardProps {
    rosters: RosterWithMember[];
    allowSelfStudy?: boolean;
    allowAdminDeleteStudy?: boolean;
}

export function StudioMembersCard({
    rosters,
    allowSelfStudy = true,
    allowAdminDeleteStudy = true,
}: StudioMembersCardProps) {
    const {
        studioMembers,
        loading,
        ending,
        isStartingStudy,
        deletingSessionId,
        errorMsg,
        canAdminDeleteStudy,
        isAlreadyInStudio,
        isSelfStudying,
        isInOwnDutyPeriod,
        startSelfStudy,
        endSelfStudy,
        deleteStudySession,
    } = useStudioPresence({ rosters, allowAdminDeleteStudy });

    return (
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-green-500" />
                    <span className="font-medium text-muted-foreground">目前在工作室</span>
                    {!loading && studioMembers.length > 0 && (
                        <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-400">
                            {studioMembers.length}人
                        </span>
                    )}
                </div>
            </div>

            {loading ? (
                <p className="text-xs text-muted-foreground">数据加载中...</p>
            ) : errorMsg ? (
                <p className="text-xs text-destructive">{errorMsg}</p>
            ) : studioMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">目前工作室暂无人</p>
            ) : (
                <div className="mb-3 flex flex-wrap gap-1.5">
                    {studioMembers.map((member) => (
                        <span
                            key={member.id}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
                                member.type === 'study'
                                    ? 'bg-purple-100 text-purple-700 ring-purple-300/50 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-700/50'
                                    : 'bg-green-100 text-green-700 ring-green-300/50 dark:bg-green-950/30 dark:text-green-400 dark:ring-green-700/50'
                            )}
                        >
                            <span>{member.name}</span>
                            <span className="text-[9px] opacity-70">{member.type === 'study' ? '自习' : '值班'}</span>
                            {canAdminDeleteStudy && member.type === 'study' ? (
                                <button
                                    type="button"
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-70 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={`移除 ${member.name} 的自习记录`}
                                    title={`移除 ${member.name} 的自习记录`}
                                    onClick={() => void deleteStudySession(member)}
                                    disabled={deletingSessionId === member.sessionId}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            ) : null}
                        </span>
                    ))}
                </div>
            )}

            {allowSelfStudy && !loading && !errorMsg && !isAlreadyInStudio ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-auto h-8 w-full text-xs"
                    onClick={() => void startSelfStudy()}
                    disabled={isInOwnDutyPeriod || isStartingStudy}
                >
                    {isStartingStudy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <BookOpen className="mr-1 h-3 w-3" />}
                    {isStartingStudy ? '正在验证定位...' : '我在工作室自习'}
                </Button>
            ) : allowSelfStudy && !loading && !errorMsg && isSelfStudying ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-auto h-8 w-full border-orange-300 text-xs text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                    onClick={() => void endSelfStudy()}
                    disabled={ending}
                >
                    <X className="mr-1 h-3 w-3" />
                    {ending ? '处理中...' : '结束自习'}
                </Button>
            ) : null}
        </div>
    );
}
