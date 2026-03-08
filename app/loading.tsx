export default function Loading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 p-6 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-8 w-48 bg-muted animate-pulse rounded-md" />
                    <div className="h-4 w-64 bg-muted animate-pulse rounded-md mt-1" />
                </div>
                <div className="h-10 w-32 bg-muted animate-pulse rounded-md" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="rounded-xl border bg-card text-card-foreground shadow p-6 space-y-4">
                        <div className="h-6 w-2/3 bg-muted animate-pulse rounded" />
                        <div className="h-20 w-full bg-muted animate-pulse rounded" />
                        <div className="pt-4 flex items-center justify-between">
                            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
                            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
