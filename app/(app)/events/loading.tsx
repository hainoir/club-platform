import { Skeleton } from "@/components/ui/skeleton"

export default function EventsLoading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-40" />
                    <Skeleton className="h-4 w-64 max-w-full" />
                </div>
                <div className="flex w-full flex-col items-start gap-4 sm:w-auto sm:flex-row sm:items-center">
                    <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-9 w-20" />
                    </div>
                    <Skeleton className="h-10 w-28" />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                        <Skeleton className="h-40 w-full rounded-none" />
                        <div className="space-y-4 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex gap-2">
                                    <Skeleton className="h-6 w-14 rounded-full" />
                                    <Skeleton className="h-6 w-12 rounded-full" />
                                </div>
                                <Skeleton className="h-8 w-8 rounded-full" />
                            </div>
                            <Skeleton className="h-6 w-4/5" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                            <div className="space-y-2 pt-2">
                                <Skeleton className="h-4 w-44" />
                                <Skeleton className="h-4 w-36" />
                                <Skeleton className="h-4 w-52" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-t p-4">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-9 w-20" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
