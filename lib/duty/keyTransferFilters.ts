export const E2E_KEY_TRANSFER_NOTE_PREFIX = "E2E-RPC-FIXTURE-"

// 只隐藏已经确认的测试夹具记录，确保待处理的 e2e 记录仍可被覆盖到。
export const EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER =
    `status.neq.confirmed,and(status.eq.confirmed,note.is.null),and(status.eq.confirmed,note.not.ilike.${E2E_KEY_TRANSFER_NOTE_PREFIX}%)`
