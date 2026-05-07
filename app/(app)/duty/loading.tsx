/**
 * 值班管理页骨架屏
 *
 * 模拟 DutyClient（排班表格）和 DutyManagementOverview（值班概览）的加载态。
 */
export default function DutyLoading() {
    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 animate-in fade-in duration-500">
            {/* 页面标题区域 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-8 w-36 bg-muted animate-pulse rounded-md" />
                    <div className="h-4 w-56 bg-muted animate-pulse rounded-md" />
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-28 bg-muted animate-pulse rounded-md" />
                    <div className="h-10 w-28 bg-muted animate-pulse rounded-md" />
                </div>
            </div>

            {/* 排班表格骨架 */}
            <div className="rounded-xl border bg-card shadow">
                <div className="p-4 space-y-3">
                    <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                    <div className="grid grid-cols-6 gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={`header-${i}`} className="h-8 bg-muted animate-pulse rounded" />
                        ))}
                    </div>
                    {Array.from({ length: 4 }).map((_, row) => (
                        <div key={`row-${row}`} className="grid grid-cols-6 gap-2">
                            {Array.from({ length: 6 }).map((_, col) => (
                                <div key={`cell-${row}-${col}`} className="h-16 bg-muted/60 animate-pulse rounded" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* 值班概览骨架 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`overview-${i}`} className="rounded-xl border bg-card shadow p-4 space-y-3">
                        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                        <div className="h-24 bg-muted/60 animate-pulse rounded" />
                    </div>
                ))}
            </div>
        </div>
    )
}
