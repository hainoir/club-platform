import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/supabase"

import {
    getCurrentPositionWithFallback,
    getLocationErrorReason,
    type LocationErrorReason,
} from "../shared/geolocation.ts"

// 与 supabase/migrations/20261015083723_duty_signin_geofence.sql 种下的初始行相同，只给纯函数测试用。
// 签到和自习必须读取 public.studio_geofence，环境变量不再参与判断。
const BUILTIN_STUDIO_GEOFENCE = {
    latitude: 39.181074,
    longitude: 117.12138,
    radiusMeters: 50,
    maxAccuracyMeters: 100,
}

export const STUDIO_LOCATION_ACTION_COOLDOWN_MS = 5000

export interface StudioGeofenceConfig {
    latitude: number
    longitude: number
    radiusMeters: number
    maxAccuracyMeters: number
}

export type StudioLocationValidationErrorReason =
    | LocationErrorReason
    | "empty_payload"
    | "invalid_coordinates"
    | "invalid_accuracy"
    | "insufficient_accuracy"
    | "out_of_range"
    | "geofence_unconfigured"

export interface StudioLocationValidationResult {
    latitude: number
    longitude: number
    accuracy: number
    distanceMeters: number
}

export class StudioLocationValidationError extends Error {
    reason: StudioLocationValidationErrorReason
    accuracyMeters?: number
    distanceMeters?: number

    constructor(
        reason: StudioLocationValidationErrorReason,
        options?: {
            message?: string
            accuracyMeters?: number
            distanceMeters?: number
        }
    ) {
        super(options?.message ?? reason)
        this.name = "StudioLocationValidationError"
        this.reason = reason
        this.accuracyMeters = options?.accuracyMeters
        this.distanceMeters = options?.distanceMeters
    }
}

function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
    const earthRadiusMeters = 6371e3
    const p1 = (lat1 * Math.PI) / 180
    const p2 = (lat2 * Math.PI) / 180
    const deltaP = p2 - p1
    const deltaLon = lon2 - lon1
    const deltaLambda = (deltaLon * Math.PI) / 180
    const a =
        Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return earthRadiusMeters * c
}

export function getStudioLocationHintConfig(): StudioGeofenceConfig {
    return { ...BUILTIN_STUDIO_GEOFENCE }
}

export async function loadStudioGeofence(
    supabase: SupabaseClient<Database>,
): Promise<StudioGeofenceConfig> {
    const { data, error } = await supabase
        .from("studio_geofence")
        .select("latitude, longitude, radius_meters, max_accuracy_meters")
        .eq("id", true)
        .maybeSingle()

    const latitude = Number(data?.latitude)
    const longitude = Number(data?.longitude)
    const radiusMeters = Number(data?.radius_meters)
    const maxAccuracyMeters = Number(data?.max_accuracy_meters)
    if (
        error
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || !Number.isFinite(radiusMeters)
        || !Number.isFinite(maxAccuracyMeters)
    ) {
        throw new StudioLocationValidationError("geofence_unconfigured")
    }

    return { latitude, longitude, radiusMeters, maxAccuracyMeters }
}

export function isStudioLocationValidationError(error: unknown): error is StudioLocationValidationError {
    return error instanceof StudioLocationValidationError
}

/**
 * 浏览器侧围栏判断。调用方拿到的通过结果只说明可以继续请求服务器，
 * 数据库触发器会用 studio_geofence 再判一次。
 */
export function assessStudioLocationFix(
    input: {
        latitude: number
        longitude: number
        accuracy: number
    },
    fence: StudioGeofenceConfig = getStudioLocationHintConfig(),
): StudioLocationValidationResult {
    const latitude = Number(input.latitude)
    const longitude = Number(input.longitude)
    const hint = fence

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new StudioLocationValidationError("invalid_coordinates")
    }

    const accuracy = Number(input.accuracy)

    if (!Number.isFinite(accuracy) || accuracy < 0) {
        throw new StudioLocationValidationError("invalid_accuracy")
    }

    if (accuracy > hint.maxAccuracyMeters) {
        throw new StudioLocationValidationError("insufficient_accuracy", {
            accuracyMeters: accuracy,
        })
    }

    const distanceMeters = getDistanceFromLatLonInM(latitude, longitude, hint.latitude, hint.longitude)

    if (distanceMeters > hint.radiusMeters) {
        throw new StudioLocationValidationError("out_of_range", {
            distanceMeters,
        })
    }

    return {
        latitude,
        longitude,
        accuracy,
        distanceMeters,
    }
}

export function isStudioLocationValidationFailure(error: unknown): boolean {
    if (isStudioLocationValidationError(error)) return true
    return getLocationErrorReason(error) !== "unknown"
}

export async function validateStudioLocation(
    fence: StudioGeofenceConfig,
): Promise<StudioLocationValidationResult> {
    const position = await getCurrentPositionWithFallback()

    if (!position || !position.coords) {
        throw new StudioLocationValidationError("empty_payload")
    }

    return assessStudioLocationFix({
        latitude: Number(position.coords.latitude),
        longitude: Number(position.coords.longitude),
        accuracy: Number(position.coords.accuracy),
    }, fence)
}

export function getStudioLocationErrorMessage(error: unknown): string {
    if (isStudioLocationValidationError(error)) {
        switch (error.reason) {
            case "geofence_unconfigured":
                return "工作室地理围栏尚未配置，请联系管理员。"
            case "empty_payload":
                return "未获取到有效定位信息，请检查设备定位服务后重试。"
            case "invalid_coordinates":
                return "定位坐标无效，请稍后重试。"
            case "invalid_accuracy":
                return "定位精度异常，请稍后重试。"
            case "insufficient_accuracy":
                return `当前定位精度约 ${Math.round(error.accuracyMeters ?? 0)} 米，请移动到开阔区域后重试。`
            case "out_of_range":
                return `当前位置距离工作室约 ${Math.round(error.distanceMeters ?? 0)} 米，超出允许范围。`
            default:
                break
        }
    }

    const reason = getLocationErrorReason(error)

    if (reason === "permission_denied") return "定位权限被拒绝，无法完成位置验证。"
    if (reason === "position_unavailable") return "无法获取定位信息，请检查设备定位服务。"
    if (reason === "timeout") return "定位请求超时，请稍后重试。"
    if (reason === "not_supported") return "当前设备或浏览器不支持定位。"
    if (reason === "insecure_context") return "请使用 HTTPS 或 localhost 访问后再试。"

    return "定位失败，请检查权限后重试。"
}
