import { createClient } from '@supabase/supabase-js'
import type { BrowserContext } from '@playwright/test'

import type { Database } from '../../../types/supabase'

export interface StudioFence {
    latitude: number
    longitude: number
    radiusMeters: number
    maxAccuracyMeters: number
}

export interface GeolocationFix {
    latitude: number
    longitude: number
    accuracy: number
}

const METERS_PER_DEGREE_LATITUDE = 111_320

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing ${name} for geolocation fixtures`)
    }
    return value
}

export async function readLiveStudioGeofence(): Promise<StudioFence> {
    const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    const email = requireEnv('E2E_MEMBER_EMAIL')
    const password = requireEnv('E2E_MEMBER_PASSWORD')

    const supabase = createClient<Database>(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
        throw new Error('Unable to read studio_geofence: ' + authError.message)
    }

    const { data, error } = await supabase
        .from('studio_geofence')
        .select('latitude, longitude, radius_meters, max_accuracy_meters')
        .eq('id', true)
        .maybeSingle()

    await supabase.auth.signOut()

    const latitude = Number(data?.latitude)
    const longitude = Number(data?.longitude)
    const radiusMeters = Number(data?.radius_meters)
    const maxAccuracyMeters = Number(data?.max_accuracy_meters)
    if (
        error
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || !Number.isFinite(radiusMeters)
        || !Number.isFinite(maxAccuracyMeters)
    ) {
        throw new Error('studio_geofence row is missing or incomplete')
    }

    return { latitude, longitude, radiusMeters, maxAccuracyMeters }
}

function accurateEnough(fence: StudioFence): number {
    return Math.min(10, Math.max(1, fence.maxAccuracyMeters - 1))
}

export function insideStudioFix(fence: StudioFence): GeolocationFix {
    return {
        latitude: fence.latitude,
        longitude: fence.longitude,
        accuracy: accurateEnough(fence),
    }
}

export function outsideStudioFix(fence: StudioFence): GeolocationFix {
    return {
        latitude: fence.latitude + (fence.radiusMeters + 500) / METERS_PER_DEGREE_LATITUDE,
        longitude: fence.longitude,
        accuracy: accurateEnough(fence),
    }
}

export function inaccurateStudioFix(fence: StudioFence): GeolocationFix {
    return {
        latitude: fence.latitude,
        longitude: fence.longitude,
        accuracy: Math.round(fence.maxAccuracyMeters + 50),
    }
}

export async function grantStudioGeolocation(context: BrowserContext, fix: GeolocationFix): Promise<void> {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(fix)
}
