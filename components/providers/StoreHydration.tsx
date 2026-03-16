"use client"

import { useEffect } from "react"
import { usePreferencesStore } from "@/store/usePreferencesStore"

/**
 * Triggers Zustand persist rehydration on the client after mount.
 *
 * Persisted preference state uses `skipHydration: true` so that the first
 * client render matches the server-rendered HTML.
 * Once the component mounts we call `rehydrate()` to load persisted
 * state from localStorage, which triggers a safe re-render.
 */
export function StoreHydration() {
    useEffect(() => {
        usePreferencesStore.persist.rehydrate()
    }, [])

    return null
}
