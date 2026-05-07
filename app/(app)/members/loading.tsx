/**
 * 成员管理页骨架屏
 *
 * 模拟成员列表表格的加载态。
 */
export default function MembersLoading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 p-4 md:p-8 pt-6">
            {/* 页面标题 + 搜索/操作区域 */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-8 w-32 bg-muted animate-pulse rounded-md" />
                    <div className="h-4 w-48 bg-muted animate-pulse rounded-md" />
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-48 bg-muted animate-pulse rounded-md" />
                    <div className="h-10 w-24 bg-muted animate-pulse rounded-md" />
                </div>
            </div>

            {/* 成员表格骨架 */}
            <div className="rounded-xl border bg-card shadow">
                <div className="p-4 space-y-3">
                    {/* 表头 */}
                    <div className="grid grid-cols-5 gap-4 pb-2 border-b">
                        {["w-20", "w-24", "w-16", "w-20", "w-16"].map((w, i) => (
                            <div key={`th-${i}`} className={`h-4 ${w} bg-muted animate-pulse rounded`} />
                        ))}
                    </div>
                    {/* 行 */}
                    {Array.from({ length: 8 }).map((_, row) => (
                        <div key={`row-${row}`} className="grid grid-cols-5 gap-4 py-2">
                            <div className="h-4 w-16 bg-muted/60 animate-pulse rounded" />
                            <div className="h-4 w-20 bg-muted/60 animate-pulse rounded" />
                            <div className="h-4 w-12 bg-muted/60 animate-pulse rounded" />
                            <div className="h-4 w-16 bg-muted/60 animate-pulse rounded" />
                            <div className="h-4 w-14 bg-muted/60 animate-pulse rounded" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
