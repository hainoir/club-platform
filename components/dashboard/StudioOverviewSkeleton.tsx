import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function StudioOverviewSkeleton() {
    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col border border-border shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">
                        <Skeleton className="h-5 w-32" />
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>

            <div className="h-full lg:col-span-2">
                <Card className="flex h-full flex-col border border-border shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold">
                            <Skeleton className="h-5 w-32" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-[200px] w-full" />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
