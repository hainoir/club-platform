export const PUSH_RETRY_DELAYS_MS = [
    60_000,
    5 * 60_000,
    15 * 60_000,
    60 * 60_000,
    6 * 60 * 60_000,
] as const

export function getPushRetryDelayMs(attempts: number): number {
    const index = Math.min(Math.max(Math.trunc(attempts) - 1, 0), PUSH_RETRY_DELAYS_MS.length - 1)
    return PUSH_RETRY_DELAYS_MS[index]
}

export function classifyPushStatus(statusCode: number | null): {
    transient: boolean
    subscriptionExpired: boolean
} {
    return {
        subscriptionExpired: statusCode === 404 || statusCode === 410,
        transient: statusCode === 429 || statusCode === null || statusCode >= 500,
    }
}
