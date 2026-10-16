export const GEOFENCE_RADIUS_MIN = 20
export const GEOFENCE_RADIUS_MAX = 200
export const GEOFENCE_ACCURACY_MIN = 30
export const GEOFENCE_ACCURACY_MAX = 200
export const GEOFENCE_REASON_MAX = 200

export interface GeofenceUpdateInput {
    latitude: string
    longitude: string
    radiusMeters: string
    maxAccuracyMeters: string
    reason: string
}

export interface GeofenceUpdateValues {
    latitude: number
    longitude: number
    radiusMeters: number
    maxAccuracyMeters: number
    reason: string
}

export type GeofenceUpdateResult =
    | { ok: true; value: GeofenceUpdateValues }
    | { ok: false; message: string }

function readFinite(raw: string): number | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : null
}

/**
 * 与 update_studio_geofence 的边界一致，保存前先拦住明显无效的输入。
 */
export function validateGeofenceUpdate(input: GeofenceUpdateInput): GeofenceUpdateResult {
    const latitude = readFinite(input.latitude)
    const longitude = readFinite(input.longitude)
    if (
        latitude === null
        || longitude === null
        || latitude < -90
        || latitude > 90
        || longitude < -180
        || longitude > 180
    ) {
        return { ok: false, message: "围栏坐标无效。" }
    }

    const radiusMeters = readFinite(input.radiusMeters)
    if (radiusMeters === null || radiusMeters < GEOFENCE_RADIUS_MIN || radiusMeters > GEOFENCE_RADIUS_MAX) {
        return { ok: false, message: "围栏半径必须在 20 到 200 米之间。" }
    }

    const maxAccuracyMeters = readFinite(input.maxAccuracyMeters)
    if (
        maxAccuracyMeters === null
        || maxAccuracyMeters < GEOFENCE_ACCURACY_MIN
        || maxAccuracyMeters > GEOFENCE_ACCURACY_MAX
    ) {
        return { ok: false, message: "精度上限必须在 30 到 200 米之间。" }
    }

    const reason = input.reason.trim()
    if (reason.length < 1 || reason.length > GEOFENCE_REASON_MAX) {
        return { ok: false, message: "请填写 1 到 200 字的原因。" }
    }

    return {
        ok: true,
        value: { latitude, longitude, radiusMeters, maxAccuracyMeters, reason },
    }
}

export function readGeofenceRpcError(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === "string" && message.trim()) return message.trim()
    }
    return "暂时无法更新围栏，请稍后重试。"
}
