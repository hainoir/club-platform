import {
    getCurrentPositionWithFallback,
    getLocationErrorReason,
    type LocationErrorReason,
} from "../shared/geolocation.ts"

const DEFAULT_STUDIO_COORDS = {
    lat: 39.181074,
    lng: 117.12138,
}

const DEFAULT_MAX_VALID_RADIUS_METERS = 50
const DEFAULT_MAX_GEO_ACCURACY_METERS = 100

export const STUDIO_LOCATION_ACTION_COOLDOWN_MS = 5000

function parseClientNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

const STUDIO_COORDS = {
    lat: parseClientNumber(process.env.NEXT_PUBLIC_STUDIO_LAT, DEFAULT_STUDIO_COORDS.lat),
    lng: parseClientNumber(process.env.NEXT_PUBLIC_STUDIO_LNG, DEFAULT_STUDIO_COORDS.lng),
}

const MAX_VALID_RADIUS_METERS = parseClientNumber(
    process.env.NEXT_PUBLIC_STUDIO_RADIUS_METERS,
    DEFAULT_MAX_VALID_RADIUS_METERS
)

const MAX_GEO_ACCURACY_METERS = parseClientNumber(
    process.env.NEXT_PUBLIC_STUDIO_MAX_GEO_ACCURACY_METERS,
    DEFAULT_MAX_GEO_ACCURACY_METERS
)

export type StudioLocationValidationErrorReason =
    | LocationErrorReason
    | "empty_payload"
    | "invalid_coordinates"
    | "invalid_accuracy"
    | "insufficient_accuracy"
    | "out_of_range"

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

export function isStudioLocationValidationError(error: unknown): error is StudioLocationValidationError {
    return error instanceof StudioLocationValidationError
}

export function isStudioLocationValidationFailure(error: unknown): boolean {
    if (isStudioLocationValidationError(error)) return true
    return getLocationErrorReason(error) !== "unknown"
}

export async function validateStudioLocation(): Promise<StudioLocationValidationResult> {
    const position = await getCurrentPositionWithFallback()

    if (!position || !position.coords) {
        throw new StudioLocationValidationError("empty_payload")
    }

    const latitude = Number(position.coords.latitude)
    const longitude = Number(position.coords.longitude)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new StudioLocationValidationError("invalid_coordinates")
    }

    const accuracy = Number(position.coords.accuracy)

    if (!Number.isFinite(accuracy)) {
        throw new StudioLocationValidationError("invalid_accuracy")
    }

    if (accuracy > MAX_GEO_ACCURACY_METERS) {
        throw new StudioLocationValidationError("insufficient_accuracy", {
            accuracyMeters: accuracy,
        })
    }

    const distanceMeters = getDistanceFromLatLonInM(latitude, longitude, STUDIO_COORDS.lat, STUDIO_COORDS.lng)

    if (distanceMeters > MAX_VALID_RADIUS_METERS) {
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

export function getStudioLocationErrorMessage(error: unknown): string {
    if (isStudioLocationValidationError(error)) {
        switch (error.reason) {
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
