import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="space-y-2">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 md:grid-cols-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>

            <div className="rounded-xl border bg-card shadow-sm">
                <div className="space-y-2 p-6">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-64 max-w-full" />
                </div>
                <div className="space-y-4 p-6 pt-0">
                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-56" />
                        </div>
                        <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-64" />
                        </div>
                        <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-3 w-60" />
                        </div>
                        <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    )
}
