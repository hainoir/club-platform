"use client"

import { useReportWebVitals } from 'next/web-vitals'

const ENABLE_WEB_VITALS_DEBUG = process.env.NEXT_PUBLIC_ENABLE_WEB_VITALS_DEBUG === 'true'

export function WebVitals() {
    useReportWebVitals((metric) => {
        if (process.env.NODE_ENV === 'development' && ENABLE_WEB_VITALS_DEBUG) {
            console.warn('[Web Vitals]', metric.name, metric.value.toFixed(2), metric.rating, metric);
        }
    })

    return null
}
