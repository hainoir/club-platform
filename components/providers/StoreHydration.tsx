"use client"

import { useEffect } from "react"
import { useUserStore } from "@/store/useUserStore"
import { usePreferencesStore } from "@/store/usePreferencesStore"

/**
 * Triggers Zustand persist rehydration on the client after mount.
 *
 * Both stores use `skipHydration: true` so that the first client render
 * matches the server-rendered HTML (both use the store defaults).
 * Once the component mounts we call `rehydrate()` to load persisted
 * state from localStorage, which triggers a safe re-render.
 */
export function StoreHydration() {
    useEffect(() => {
        useUserStore.persist.rehydrate()
        usePreferencesStore.persist.rehydrate()
    }, [])

    return null
}
