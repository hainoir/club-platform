import assert from 'node:assert/strict'
import test from 'node:test'

import {
    assessStudioLocationFix,
    getStudioLocationHintConfig,
    StudioLocationValidationError,
} from '../../lib/studio/studio-location.ts'

const METERS_PER_DEGREE_LATITUDE = 111_320

function northOfStudio(meters: number) {
    const hint = getStudioLocationHintConfig()
    return {
        latitude: hint.latitude + meters / METERS_PER_DEGREE_LATITUDE,
        longitude: hint.longitude,
    }
}

test('a fix at the hinted studio point is inside the geofence', () => {
    const hint = getStudioLocationHintConfig()
    const result = assessStudioLocationFix({
        latitude: hint.latitude,
        longitude: hint.longitude,
        accuracy: 10,
    })

    assert.ok(result.distanceMeters < 1)
    assert.equal(result.accuracy, 10)
})

test('a fix inside the hinted radius is accepted and one past it is rejected', () => {
    const hint = getStudioLocationHintConfig()
    const inside = assessStudioLocationFix({
        ...northOfStudio(hint.radiusMeters / 2),
        accuracy: 20,
    })
    assert.ok(inside.distanceMeters <= hint.radiusMeters)
    assert.ok(inside.distanceMeters > hint.radiusMeters / 4)

    assert.throws(
        () => assessStudioLocationFix({
            ...northOfStudio(hint.radiusMeters + 40),
            accuracy: 20,
        }),
        (error: unknown) => {
            assert.ok(error instanceof StudioLocationValidationError)
            assert.equal(error.reason, 'out_of_range')
            assert.ok((error.distanceMeters ?? 0) > hint.radiusMeters)
            return true
        }
    )
})

test('accuracy at the hinted ceiling passes and anything worse is rejected', () => {
    const hint = getStudioLocationHintConfig()
    const accepted = assessStudioLocationFix({
        latitude: hint.latitude,
        longitude: hint.longitude,
        accuracy: hint.maxAccuracyMeters,
    })
    assert.equal(accepted.accuracy, hint.maxAccuracyMeters)

    assert.throws(
        () => assessStudioLocationFix({
            latitude: hint.latitude,
            longitude: hint.longitude,
            accuracy: hint.maxAccuracyMeters + 1,
        }),
        (error: unknown) => {
            assert.ok(error instanceof StudioLocationValidationError)
            assert.equal(error.reason, 'insufficient_accuracy')
            assert.equal(error.accuracyMeters, hint.maxAccuracyMeters + 1)
            return true
        }
    )
})

test('invalid coordinates and negative accuracy are rejected before the distance check', () => {
    assert.throws(
        () => assessStudioLocationFix({ latitude: Number.NaN, longitude: 0, accuracy: 5 }),
        (error: unknown) => error instanceof StudioLocationValidationError && error.reason === 'invalid_coordinates'
    )
    assert.throws(
        () => assessStudioLocationFix({ latitude: 0, longitude: 0, accuracy: -1 }),
        (error: unknown) => error instanceof StudioLocationValidationError && error.reason === 'invalid_accuracy'
    )
})
