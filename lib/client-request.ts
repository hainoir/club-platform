const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

export function extractErrorMessage(error: unknown, fallback: string): string {
    const message =
        error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: string }).message || '')
            : '';
    return message || fallback;
}

export async function runWithTimeout<T>(
    request: (signal: AbortSignal) => Promise<T>,
    timeoutMs = DEFAULT_QUERY_TIMEOUT_MS
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await request(controller.signal);
    } finally {
        clearTimeout(timer);
    }
}
