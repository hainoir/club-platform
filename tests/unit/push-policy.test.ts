import assert from "node:assert/strict"
import test from "node:test"

import { urlBase64ToUint8Array } from "../../lib/push/client.ts"
import { classifyPushStatus, getPushRetryDelayMs } from "../../lib/push/policy.ts"

test("VAPID public keys decode from URL-safe base64", () => {
    const decoded = urlBase64ToUint8Array("AQIDBA")
    assert.deepEqual(Array.from(decoded), [1, 2, 3, 4])
})

test("push failures classify expired subscriptions and transient responses", () => {
    assert.deepEqual(classifyPushStatus(410), { transient: false, subscriptionExpired: true })
    assert.deepEqual(classifyPushStatus(404), { transient: false, subscriptionExpired: true })
    assert.deepEqual(classifyPushStatus(429), { transient: true, subscriptionExpired: false })
    assert.deepEqual(classifyPushStatus(503), { transient: true, subscriptionExpired: false })
    assert.deepEqual(classifyPushStatus(400), { transient: false, subscriptionExpired: false })
})

test("push retries use bounded exponential-style delays", () => {
    assert.equal(getPushRetryDelayMs(1), 60_000)
    assert.equal(getPushRetryDelayMs(2), 5 * 60_000)
    assert.equal(getPushRetryDelayMs(3), 15 * 60_000)
    assert.equal(getPushRetryDelayMs(4), 60 * 60_000)
    assert.equal(getPushRetryDelayMs(5), 6 * 60 * 60_000)
    assert.equal(getPushRetryDelayMs(99), 6 * 60 * 60_000)
})
