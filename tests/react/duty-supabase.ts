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
    method: 'select' | 'insert' | 'delete' | 'eq'
    payload?: unknown
    column?: string
    value?: unknown
}

interface CreateDutySupabaseOptions {
    rpc?: (name: string, args: Record<string, unknown>) => Promise<QueryResult>
    results?: Partial<Record<string, QueryResult>>
}

export function createDutySupabase(options: CreateDutySupabaseOptions = {}) {
    const calls: DutyCall[] = []
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
        if (options.rpc) return options.rpc(name, args ?? {})
        return { data: null, error: null }
    })

    function from(table: string) {
        const result = options.results?.[table] ?? {
            data: table === 'duty_logs' ? [] : { id: 'leave-1' },
            error: null,
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
            gte() {
                return query
            },
            limit() {
                return Promise.resolve(result)
            },
            returns() {
                return query
            },
            single() {
                return Promise.resolve(result)
            },
            then(
                onFulfilled: (value: QueryResult) => unknown,
                onRejected?: (reason: unknown) => unknown
            ) {
                return Promise.resolve(result).then(onFulfilled, onRejected)
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
