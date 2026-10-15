"use client"

import * as React from "react"
import { MapPinned } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ToastType } from "@/components/ui/toast-simple"
import { readGeofenceRpcError, validateGeofenceUpdate } from "@/lib/studio/geofence-update"

import type { SettingsSupabaseClient } from "./settings-types"

interface GeofenceTabProps {
    supabase: SettingsSupabaseClient
    toast: (toast: Omit<ToastType, "id">) => void
}

interface FenceRow {
    latitude: number
    longitude: number
    radius_meters: number
    max_accuracy_meters: number
}

interface AuditRow {
    id: string
    created_at: string
    reason: string
    latitude: number
    longitude: number
    radius_meters: number
    max_accuracy_meters: number
}

const shanghaiTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
})

function formatAuditTime(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return shanghaiTime.format(date)
}

export function GeofenceTab({ supabase, toast }: GeofenceTabProps) {
    const [latitude, setLatitude] = React.useState("")
    const [longitude, setLongitude] = React.useState("")
    const [radiusMeters, setRadiusMeters] = React.useState("")
    const [maxAccuracyMeters, setMaxAccuracyMeters] = React.useState("")
    const [reason, setReason] = React.useState("")
    const [audits, setAudits] = React.useState<AuditRow[]>([])
    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
    const [statusMessage, setStatusMessage] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        const [fenceResult, auditResult] = await Promise.all([
            supabase
                .from("studio_geofence")
                .select("latitude, longitude, radius_meters, max_accuracy_meters")
                .eq("id", true)
                .maybeSingle(),
            supabase
                .from("studio_geofence_audits")
                .select("id, created_at, reason, latitude, longitude, radius_meters, max_accuracy_meters")
                .order("created_at", { ascending: false })
                .limit(5),
        ])

        if (fenceResult.error || !fenceResult.data) {
            setErrorMessage(fenceResult.error ? readGeofenceRpcError(fenceResult.error) : "未读取到工作室围栏。")
            return false
        }

        const fence = fenceResult.data as FenceRow
        setLatitude(String(fence.latitude))
        setLongitude(String(fence.longitude))
        setRadiusMeters(String(fence.radius_meters))
        setMaxAccuracyMeters(String(fence.max_accuracy_meters))

        if (auditResult.error) {
            setAudits([])
            setErrorMessage(readGeofenceRpcError(auditResult.error))
            return true
        }

        setAudits((auditResult.data ?? []) as AuditRow[])
        return true
    }, [supabase])

    React.useEffect(() => {
        let cancelled = false
        setLoading(true)
        void load().finally(() => {
            if (!cancelled) setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [load])

    const onSave = async () => {
        const parsed = validateGeofenceUpdate({
            latitude,
            longitude,
            radiusMeters,
            maxAccuracyMeters,
            reason,
        })
        if (!parsed.ok) {
            setStatusMessage(null)
            setErrorMessage(parsed.message)
            return
        }

        setSaving(true)
        setErrorMessage(null)
        setStatusMessage(null)
        try {
            const { error } = await supabase.rpc("update_studio_geofence", {
                p_latitude: parsed.value.latitude,
                p_longitude: parsed.value.longitude,
                p_radius_meters: parsed.value.radiusMeters,
                p_max_accuracy_meters: parsed.value.maxAccuracyMeters,
                p_reason: parsed.value.reason,
            })
            if (error) throw error

            setReason("")
            await load()
            setStatusMessage("围栏已更新")
            toast({ title: "围栏已更新", description: "工作室围栏和审计记录已保存。" })
        } catch (error: unknown) {
            const message = readGeofenceRpcError(error)
            setErrorMessage(message)
            toast({ title: "围栏更新失败", description: message, variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPinned className="h-5 w-5 text-primary" />
                    工作室围栏
                </CardTitle>
                <CardDescription>
                    调整签到和自习使用的圆心、半径和精度上限。半径 20–200 米，精度上限 30–200 米。
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? <p className="text-sm text-muted-foreground">正在读取围栏配置...</p> : null}

                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void onSave()
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="geofence-latitude">纬度</Label>
                            <Input
                                id="geofence-latitude"
                                inputMode="decimal"
                                value={latitude}
                                onChange={(event) => setLatitude(event.target.value)}
                                disabled={loading || saving}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="geofence-longitude">经度</Label>
                            <Input
                                id="geofence-longitude"
                                inputMode="decimal"
                                value={longitude}
                                onChange={(event) => setLongitude(event.target.value)}
                                disabled={loading || saving}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="geofence-radius">半径（米）</Label>
                            <Input
                                id="geofence-radius"
                                inputMode="decimal"
                                value={radiusMeters}
                                onChange={(event) => setRadiusMeters(event.target.value)}
                                disabled={loading || saving}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="geofence-accuracy">精度上限（米）</Label>
                            <Input
                                id="geofence-accuracy"
                                inputMode="decimal"
                                value={maxAccuracyMeters}
                                onChange={(event) => setMaxAccuracyMeters(event.target.value)}
                                disabled={loading || saving}
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="geofence-reason">原因</Label>
                            <Input
                                id="geofence-reason"
                                value={reason}
                                maxLength={200}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder="说明这次调整，1 到 200 字"
                                disabled={loading || saving}
                            />
                        </div>
                    </div>

                    {errorMessage ? (
                        <p role="alert" className="text-sm text-destructive">
                            {errorMessage}
                        </p>
                    ) : null}
                    {statusMessage ? (
                        <p role="status" className="text-sm text-muted-foreground">
                            {statusMessage}
                        </p>
                    ) : null}

                    <Button type="submit" disabled={loading || saving}>
                        {saving ? "保存中..." : "保存围栏"}
                    </Button>
                </form>

                <div className="space-y-2">
                    <h3 className="text-sm font-medium">最近的修改</h3>
                    {audits.length === 0 ? (
                        <p className="text-sm text-muted-foreground">还没有围栏修改记录。</p>
                    ) : (
                        <ul className="space-y-2 text-sm">
                            {audits.map((audit) => (
                                <li key={audit.id} className="rounded-md border px-3 py-2">
                                    <p>{audit.reason}</p>
                                    <p className="text-muted-foreground">
                                        {formatAuditTime(audit.created_at)}
                                        {" · "}
                                        半径 {audit.radius_meters} 米，精度上限 {audit.max_accuracy_meters} 米
                                        {" · "}
                                        {audit.latitude}, {audit.longitude}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
