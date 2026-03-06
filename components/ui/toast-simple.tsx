"use client"
import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export type ToastType = { id: string; title: string; description?: string; variant?: "default" | "destructive" }

const ToastContext = React.createContext<{
    toasts: ToastType[]
    toast: (t: Omit<ToastType, "id">) => void
    dismiss: (id: string) => void
}>({ toasts: [], toast: () => { }, dismiss: () => { } })

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = React.useState<ToastType[]>([])

    const toast = React.useCallback((t: Omit<ToastType, "id">) => {
        const id = Math.random().toString(36).substr(2, 9)
        setToasts((prev) => [...prev, { id, ...t }])
        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }, 3000)
    }, [])

    const dismiss = React.useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ toasts, toast, dismiss }}>
            {children}
            <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={cn(
                            "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all mb-4",
                            t.variant === "destructive"
                                ? "destructive group border-destructive bg-destructive text-destructive-foreground"
                                : "border bg-background text-foreground"
                        )}
                    >
                        <div className="grid gap-1">
                            {t.title && <div className="text-sm font-semibold">{t.title}</div>}
                            {t.description && <div className="text-sm opacity-90">{t.description}</div>}
                        </div>
                        <button
                            onClick={() => dismiss(t.id)}
                            className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export const useToast = () => React.useContext(ToastContext)
