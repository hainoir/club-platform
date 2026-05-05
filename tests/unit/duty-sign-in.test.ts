import assert from "node:assert/strict"
import test from "node:test"

import { resolveCurrentDutyAvailability } from "../../lib/duty-sign-in.ts"

function withTimeZone<T>(tz: string, fn: () => T): T {
    const previous = process.env.TZ
    process.env.TZ = tz
    try {
        return fn()
    } finally {
        if (previous === undefined) {
            delete process.env.TZ
        } else {
            process.env.TZ = previous
        }
    }
}

test("assigned members can sign in during their current period", () => {
    const availability = withTimeZone("Asia/Shanghai", () =>
        resolveCurrentDutyAvailability([2], new Date(2026, 2, 24, 10, 10, 0))
    )

    assert.deepEqual(availability, {
        canSignInNow: true,
        disabledReason: null,
    })
})

test("unassigned members stay disabled during another member's active period", () => {
    const availability = withTimeZone("Asia/Shanghai", () =>
        resolveCurrentDutyAvailability([1], new Date(2026, 2, 24, 10, 10, 0))
    )

    assert.deepEqual(availability, {
        canSignInNow: false,
        disabledReason: "not_assigned",
    })
})

test("all members stay disabled outside sign-in periods", () => {
    const availability = withTimeZone("Asia/Shanghai", () =>
        resolveCurrentDutyAvailability([2], new Date(2026, 2, 24, 12, 10, 0))
    )

    assert.deepEqual(availability, {
        canSignInNow: false,
        disabledReason: "not_in_period",
    })
})

test("assigned members stay disabled on public holidays", () => {
    const availability = withTimeZone("Asia/Shanghai", () =>
        resolveCurrentDutyAvailability([1], new Date(2026, 4, 1, 8, 10, 0))
    )

    assert.deepEqual(availability, {
        canSignInNow: false,
        disabledReason: "holiday",
    })
})
