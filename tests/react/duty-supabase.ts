import { vi } from 'vitest'

import type { DutySupabaseClient } from '@/hooks/duty/types'

export type QueryError = {
    message: string
    code?: string
    hint?: string
    details?: string
}

export type QueryResult = {
    data: unknown
    error: QueryError | null
}

export type DutyCall = {
    table: string
    method: 'select' | 'insert' | 'delete' | 'eq' | 'gte' | 'order' | 'range'
    payload?: unknown
    column?: string
    value?: unknown
}

const SEEDED_GEOFENCE = {
    id: true,
    latitude: 39.181074,
    longitude: 117.12138,
    radius_meters: 50,
    max_accuracy_meters: 100,
}

interface CreateDutySupabaseOptions {
    rpc?: (name: string, args: Record<string, unknown>) => Promise<QueryResult>
    results?: Partial<Record<string, QueryResult | QueryResult[]>>
    memberId?: string
}

export function createDutySupabase(options: CreateDutySupabaseOptions = {}) {
    const calls: DutyCall[] = []
    const pageCursors: Record<string, number> = {}
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
        if (name === 'current_member_id') {
            return { data: options.memberId ?? 'member-1', error: null }
        }
        if (options.rpc) return options.rpc(name, args ?? {})
        return { data: null, error: null }
    })

    function from(table: string) {
        const configured = options.results?.[table]
        const fallback: QueryResult = {
            data: table === 'duty_logs'
                ? []
                : table === 'studio_geofence'
                    ? SEEDED_GEOFENCE
                    : { id: 'leave-1' },
            error: null,
        }
        const single = (configured && !Array.isArray(configured)) ? configured : fallback
        function nextResult(): QueryResult {
            if (Array.isArray(configured)) {
                const index = pageCursors[table] ?? 0
                pageCursors[table] = index + 1
                return configured[index] ?? { data: [], error: null }
            }
            return single
        }
        const query = {
            select() {
                calls.push({ table, method: 'select' })
                return query
            },
            insert(payload: unknown) {
                calls.push({ table, method: 'insert', payload })
                return query
            },
            delete() {
                calls.push({ table, method: 'delete' })
                return query
            },
            eq(column: string, value: unknown) {
                calls.push({ table, method: 'eq', column, value })
                return query
            },
            gte(column: string, value: unknown) {
                calls.push({ table, method: 'gte', column, value })
                return query
            },
            order(column: string, options?: { ascending?: boolean }) {
                calls.push({ table, method: 'order', column, value: options })
                return query
            },
            range(from: number, to: number) {
                calls.push({ table, method: 'range', value: { from, to } })
                return query
            },
            gt() {
                return query
            },
            limit() {
                return Promise.resolve(nextResult())
            },
            maybeSingle() {
                return Promise.resolve(nextResult())
            },
            returns() {
                return query
            },
            single() {
                return Promise.resolve(nextResult())
            },
            then(
                onFulfilled: (value: QueryResult) => unknown,
                onRejected?: (reason: unknown) => unknown
            ) {
                return Promise.resolve(nextResult()).then(onFulfilled, onRejected)
            },
        }
        return query
    }

    return {
        client: { from, rpc } as unknown as DutySupabaseClient,
        calls,
        rpc,
    }
}
