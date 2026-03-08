"use client"

import { useReportWebVitals } from 'next/web-vitals'

export function WebVitals() {
    useReportWebVitals((metric) => {
        // 在开发环境且由终端明确请求时，或直接在生产环境配置第三方埋点使用。这里选择在开发环境中直接在控制台输出。
        if (process.env.NODE_ENV === 'development') {
            const isGood = metric.rating === 'good';
            console.groupCollapsed(
                `%c Web Vitals: ${metric.name} `,
                `background: ${isGood ? '#2e7d32' : '#d32f2f'}; color: white; padding: 2px 4px; border-radius: 4px;`
            );
            console.log(`Value: ${metric.value.toFixed(2)}`);
            console.log(`Rating: ${metric.rating}`);
            console.log(`Full Metric:`, metric);
            console.groupEnd();
        }
    })

    return null
}
