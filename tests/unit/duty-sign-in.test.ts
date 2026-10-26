import assert from "node:assert/strict"
import test from "node:test"

import { DutySignInError, getDutySignInErrorMessage, resolveCurrentDutyAvailability } from "../../lib/duty/duty-sign-in.ts"

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

test("server geofence rejections are shown from the database hint", () => {
    const outOfRange = {
        hint: "out_of_range",
        details: "111.2",
        message: "当前位置距离工作室约 111 米，超出允许范围。",
    }

    assert.equal(
        getDutySignInErrorMessage(new DutySignInError("location", outOfRange.message, outOfRange)),
        "当前位置距离工作室约 111 米，超出允许范围。"
    )
    assert.equal(
        getDutySignInErrorMessage({ hint: "insufficient_accuracy", details: "180.4" }),
        "当前定位精度约 180 米，请移动到开阔区域后重试。"
    )
    assert.equal(
        getDutySignInErrorMessage({ hint: "geofence_unconfigured" }),
        "工作室地理围栏尚未配置，请联系管理员。"
    )
    assert.equal(
        getDutySignInErrorMessage({ hint: "invalid_coordinates" }),
        "定位坐标无效，请稍后重试。"
    )
    assert.equal(
        getDutySignInErrorMessage({ hint: "holiday" }),
        "今日为公共假日，不记录值班签到。"
    )
    assert.equal(
        getDutySignInErrorMessage({ hint: "outside_shift_window" }),
        "当前不在值班签到时段。"
    )
    assert.equal(
        getDutySignInErrorMessage({ hint: "not_rostered" }),
        "当前节次没有你的排班，不能签到。"
    )
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
