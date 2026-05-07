"use client"

import { Switch } from "@/components/ui/switch"

interface PreferenceSwitchProps {
    label: string
    description: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}

export function PreferenceSwitch({
    label,
    description,
    checked,
    onCheckedChange,
}: PreferenceSwitchProps) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    )
}
