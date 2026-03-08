import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { FileQuestion } from "lucide-react"

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-muted p-4 rounded-full">
                <FileQuestion className="h-12 w-12 text-muted-foreground" />
            </div>
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">页面未找到 (404)</h2>
                <p className="text-muted-foreground max-w-[500px]">
                    哎呀，您试图访问的面包屑断碎了。页面可能已被移动、删除，或者您输入的网址有误。
                </p>
            </div>
            <Button asChild>
                <Link href="/">返回俱乐部首页</Link>
            </Button>
        </div>
    )
}
