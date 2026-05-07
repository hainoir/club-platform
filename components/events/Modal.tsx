"use client"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useEffect, useState } from "react"

export default function Modal({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [open, setOpen] = useState(true)

    const onDismiss = () => {
        setOpen(false)
        router.back()
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
            <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-slate-200/60 dark:border-zinc-800/60 shadow-2xl">
                {/* 隐藏关闭按钮的默认聚焦样式，增加一层更美观的滚动容器 */}
                <div className="max-h-[85vh] overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </DialogContent>
        </Dialog>
    )
}
