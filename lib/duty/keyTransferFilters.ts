export const E2E_KEY_TRANSFER_NOTE_PREFIX = "E2E-RPC-FIXTURE-"

// Hide only confirmed fixture rows so pending e2e rows can still be exercised.
export const EXCLUDE_CONFIRMED_E2E_KEY_TRANSFER_FILTER =
    `status.neq.confirmed,and(status.eq.confirmed,note.is.null),and(status.eq.confirmed,note.not.ilike.${E2E_KEY_TRANSFER_NOTE_PREFIX}%)`
