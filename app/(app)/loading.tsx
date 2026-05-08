import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-40" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>
                <Skeleton className="h-10 w-full sm:w-32" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2">
                    <div className="space-y-5">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-4 w-56" />
                            </div>
                            <Skeleton className="h-9 w-24" />
                        </div>
                        <Skeleton className="h-24 w-full" />
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border bg-card p-6 shadow-sm">
                    <div className="space-y-4">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-52" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-6 shadow-sm">
                    <div className="space-y-4">
                        <Skeleton className="h-5 w-36" />
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
                <div className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2">
                    <div className="space-y-4">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border bg-card p-6 shadow-sm">
                    <Skeleton className="h-36 w-full" />
                </div>
                <div className="rounded-xl border bg-card p-6 shadow-sm lg:col-span-2">
                    <Skeleton className="h-48 w-full" />
                </div>
            </div>
        </div>
    )
}
