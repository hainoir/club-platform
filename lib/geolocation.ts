export type LocationErrorReason =
    | "permission_denied"
    | "position_unavailable"
    | "timeout"
    | "not_supported"
    | "insecure_context"
    | "unknown"

export class LocationError extends Error {
    reason: LocationErrorReason

    constructor(reason: LocationErrorReason, message?: string) {
        super(message ?? reason)
        this.name = "LocationError"
        this.reason = reason
    }
}

const GEO_PERMISSION_DENIED = 1
const GEO_POSITION_UNAVAILABLE = 2
const GEO_TIMEOUT = 3

const PRIMARY_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 0,
}

const FALLBACK_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,
    timeout: 12_000,
    maximumAge: 120_000,
}

function isLocationError(error: unknown): error is LocationError {
    return error instanceof LocationError
}

function toLocationReasonByCode(code: number): LocationErrorReason {
    if (code === GEO_PERMISSION_DENIED) return "permission_denied"
    if (code === GEO_POSITION_UNAVAILABLE) return "position_unavailable"
    if (code === GEO_TIMEOUT) return "timeout"
    return "unknown"
}

function requestCurrentPosition(options: PositionOptions, hardTimeoutMs: number): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
            reject(new LocationError("not_supported", "Geolocation API is not available."))
            return
        }

        let settled = false
        const finish = (handler: (value: any) => void, value: any) => {
            if (settled) return
            settled = true
            window.clearTimeout(watchdog)
            handler(value)
        }

        const watchdog = window.setTimeout(() => {
            finish(reject, new LocationError("timeout", "Location request timed out."))
        }, hardTimeoutMs)

        navigator.geolocation.getCurrentPosition(
            (position) => finish(resolve, position),
            (error) => {
                const reason = toLocationReasonByCode(error.code)
                finish(reject, new LocationError(reason, error.message || "Failed to get current position."))
            },
            options
        )
    })
}

export async function getCurrentPositionWithFallback(): Promise<GeolocationPosition> {
    if (typeof window !== "undefined" && !window.isSecureContext) {
        throw new LocationError("insecure_context", "Location requires a secure context (HTTPS).")
    }

    try {
        return await requestCurrentPosition(PRIMARY_OPTIONS, 12_000)
    } catch (error) {
        const normalized = isLocationError(error) ? error : new LocationError("unknown", "Unknown location error.")

        if (normalized.reason !== "timeout" && normalized.reason !== "position_unavailable") {
            throw normalized
        }
    }

    return requestCurrentPosition(FALLBACK_OPTIONS, 15_000)
}

export function getLocationErrorReason(error: unknown): LocationErrorReason {
    if (isLocationError(error)) return error.reason
    return "unknown"
}
