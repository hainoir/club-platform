import { getStudioDashboardData } from "@/lib/services/dashboard-service"
import { StudioMembersCard } from "@/components/duty/attendance/AttendancePanels"
import { StudioStudyStatsCard } from "@/components/dashboard/StudioStudyStatsCard"
import type { RosterWithMember } from "@/hooks/useDuty"

interface StudioOverviewProps {
    activeRosters: RosterWithMember[]
}

/**
 * 【学习注释：分离的服务端组件】
 * 将自习室统计和成员在场状态剥离成独立组件。
 * 搭配 Suspense 边界，可实现不阻塞主面板(Stream UI)渲染的效果。
 */
export async function StudioOverview({ activeRosters }: StudioOverviewProps) {
    const { studioStudyLeaderboard } = await getStudioDashboardData()

    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <StudioMembersCard rosters={activeRosters} allowAdminDeleteStudy={false} />

            <div className="h-full lg:col-span-2">
                <StudioStudyStatsCard
                    todayRanking={studioStudyLeaderboard.today}
                    weekRanking={studioStudyLeaderboard.week}
                    monthRanking={studioStudyLeaderboard.month}
                    semesterRanking={studioStudyLeaderboard.semester}
                    totalRanking={studioStudyLeaderboard.total}
                    activeCount={studioStudyLeaderboard.activeCount}
                />
            </div>
        </div>
    )
}
