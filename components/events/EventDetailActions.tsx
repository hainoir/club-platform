"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { useEventRSVP } from "@/hooks/events/useEventRSVP"
import { useProtectedAction } from "@/hooks/shared/useProtectedAction"
import { useUserStore } from "@/store/useUserStore"
import type { Event } from "@/components/events/EventsClient"

interface EventDetailActionsProps {
    event: Event
    initialIsRSVPd: boolean
    isEnded: boolean
}
export function EventDetailActions({ event, initialIsRSVPd, isEnded }: EventDetailActionsProps) {
    const [isRSVPd, setIsRSVPd] = React.useState(initialIsRSVPd)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const { user } = useUserStore()
    const { requireAuth } = useProtectedAction()
    const { handleRSVP } = useEventRSVP(requireAuth)

    React.useEffect(() => setIsRSVPd(initialIsRSVPd), [initialIsRSVPd])

    const onRSVP = async () => {
        setIsSubmitting(true)
        const result = await handleRSVP({
            ...event,
            attendeesList: isRSVPd
                ? [{ id: "current", member_id: user?.id, user_email: user?.email || "", user_name: user?.name || "" }]
                : [],
        })
        if (result !== null) setIsRSVPd(result)
        setIsSubmitting(false)
    }

    return (
        <Button onClick={onRSVP} disabled={isEnded || isSubmitting} variant={isRSVPd ? "outline" : "default"}>
            {isEnded ? "报名截止" : isRSVPd ? "取消报名" : "立即报名"}
        </Button>
    )
}
