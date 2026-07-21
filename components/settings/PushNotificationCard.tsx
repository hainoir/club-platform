"use client"

import { BellOff, BellRing, CheckCircle2, CircleAlert, Download, Loader2, Send, Smartphone } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PushNotificationsController } from "@/hooks/push/usePushNotifications"

function statusCopy(controller: PushNotificationsController): { title: string; description: string } {
    switch (controller.capabilityState) {
        case "checking":
            return { title: "正在检测", description: "正在检查浏览器、安装状态和通知权限。" }
        case "unsupported":
            return { title: "当前浏览器不支持", description: "这台设备无法使用标准 Web Push，站内消息铃铛仍可正常使用。" }
        case "requires_install":
            return { title: "请先添加到主屏幕", description: "iPhone/iPad 需要从 Safari 分享菜单选择“添加到主屏幕”，再从桌面图标打开。" }
        case "permission_denied":
            return { title: "系统通知已被拒绝", description: "请在手机系统设置中允许“社团平台”通知，然后回到这里刷新。" }
        case "enabled":
            return { title: "当前设备已开启", description: "关闭网页不影响通知；主动退出账号会停用当前设备通知。" }
        case "subscribing":
            return { title: "正在开启", description: "正在创建设备订阅并发送测试通知。" }
        case "error":
            return { title: "通知配置异常", description: controller.error || "请检查部署配置后重试。" }
        default:
            return { title: "尚未开启", description: "点击按钮后系统才会询问通知权限，页面加载不会自动弹窗。" }
    }
}

function formatTime(value: string | null): string {
    if (!value) return "尚未发送"
    try {
        return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    } catch {
        return value
    }
}

export function PushNotificationCard({ controller }: { controller: PushNotificationsController }) {
    const copy = statusCopy(controller)
    const enabled = controller.capabilityState === "enabled"
    const busy = !!controller.busyAction

    return (
        <Card data-testid="push-notification-card">
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <BellRing className="h-5 w-5 text-primary" />
                            手机系统通知
                        </CardTitle>
                        <CardDescription className="mt-1">将关键值班和工作流消息显示在手机锁屏与通知中心。</CardDescription>
                    </div>
                    <Badge variant={enabled ? "default" : "secondary"}>{copy.title}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-3 rounded-lg border bg-muted/30 p-4">
                    {enabled ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    ) : controller.capabilityState === "error" || controller.capabilityState === "permission_denied" ? (
                        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    ) : (
                        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    )}
                    <div className="space-y-1">
                        <p className="text-sm font-medium">{copy.title}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{copy.description}</p>
                    </div>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-md border p-3">
                        <p className="text-muted-foreground">PWA 安装状态</p>
                        <p className="mt-1 font-medium">{controller.support?.installed ? "已作为应用运行" : "浏览器网页"}</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-muted-foreground">已启用设备</p>
                        <p className="mt-1 font-medium">{controller.deviceStatus.activeDeviceCount} 台</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-muted-foreground">最后测试</p>
                        <p className="mt-1 font-medium">{formatTime(controller.deviceStatus.lastTestAt)}</p>
                    </div>
                </div>

                {controller.error && controller.capabilityState !== "error" && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {controller.error}
                    </p>
                )}

                <div className="flex flex-wrap gap-2">
                    {controller.installPromptAvailable && !controller.support?.installed && (
                        <Button variant="outline" onClick={() => void controller.install()} disabled={busy}>
                            {controller.busyAction === "install" ? <Loader2 className="animate-spin" /> : <Download />}
                            安装应用
                        </Button>
                    )}

                    {!enabled &&
                        controller.capabilityState !== "unsupported" &&
                        controller.capabilityState !== "requires_install" &&
                        controller.capabilityState !== "permission_denied" && (
                            <Button onClick={() => void controller.enable()} disabled={busy || controller.capabilityState === "checking"}>
                                {controller.busyAction === "enable" ? <Loader2 className="animate-spin" /> : <BellRing />}
                                开启手机通知
                            </Button>
                        )}

                    {enabled && (
                        <>
                            <Button variant="outline" onClick={() => void controller.sendTest()} disabled={busy}>
                                {controller.busyAction === "test" ? <Loader2 className="animate-spin" /> : <Send />}
                                发送测试通知
                            </Button>
                            <Button variant="outline" onClick={() => void controller.disableCurrent()} disabled={busy}>
                                {controller.busyAction === "disable-current" ? <Loader2 className="animate-spin" /> : <BellOff />}
                                停用此设备
                            </Button>
                        </>
                    )}

                    {controller.deviceStatus.activeDeviceCount > 0 && (
                        <Button variant="destructive" onClick={() => void controller.disableAll()} disabled={busy}>
                            {controller.busyAction === "disable-all" ? <Loader2 className="animate-spin" /> : <BellOff />}
                            停用全部设备
                        </Button>
                    )}

                    {(controller.capabilityState === "permission_denied" || controller.capabilityState === "error") && (
                        <Button variant="outline" onClick={() => void controller.refresh()} disabled={busy}>
                            刷新状态
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
