"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Caught by Next.js Error Boundary:", error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-destructive/10 p-4 rounded-full">
                <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">内容渲染失败</h2>
                <p className="text-muted-foreground max-w-[500px]">
                    抱歉，我们在加载此模块时遇到了意外的运行时错误。这通常是偶发异常或网络波动引起的。
                </p>
            </div>
            <div className="flex gap-4">
                <Button onClick={() => reset()} variant="default">
                    重试加载
                </Button>
                <Button onClick={() => window.location.href = '/'} variant="outline">
                    返回首页
                </Button>
            </div>
        </div>
    )
}
