import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface NotificationPreferences {
    dutyReminder: boolean
    keyTransferReminder: boolean
    eventReminder: boolean
    markReadOnOpen: boolean
}

export interface InterfacePreferences {
    compactMode: boolean
    autoRefreshSeconds: number
    showWeeklyProgressOnDashboard: boolean
}

interface PreferencesState {
    notifications: NotificationPreferences
    interface: InterfacePreferences
    setNotificationPreference: <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => void
    setInterfacePreference: <K extends keyof InterfacePreferences>(key: K, value: InterfacePreferences[K]) => void
    resetPreferences: () => void
}

const defaultNotifications: NotificationPreferences = {
    dutyReminder: true,
    keyTransferReminder: true,
    eventReminder: true,
    markReadOnOpen: true,
}

const defaultInterface: InterfacePreferences = {
    compactMode: false,
    autoRefreshSeconds: 60,
    showWeeklyProgressOnDashboard: true,
}

export const usePreferencesStore = create<PreferencesState>()(
    persist(
        (set) => ({
            notifications: defaultNotifications,
            interface: defaultInterface,
            setNotificationPreference: (key, value) =>
                set((state) => ({
                    notifications: {
                        ...state.notifications,
                        [key]: value,
                    },
                })),
            setInterfacePreference: (key, value) =>
                set((state) => ({
                    interface: {
                        ...state.interface,
                        [key]: value,
                    },
                })),
            resetPreferences: () =>
                set({
                    notifications: defaultNotifications,
                    interface: defaultInterface,
                }),
        }),
        {
            name: 'club-preferences-storage',
            skipHydration: true,
        }
    )
)
