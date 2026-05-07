"use client"
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTheme } from 'next-themes'

interface DashboardAttendanceProps {
    data: { name: string; rate: number }[]
}

export default function DashboardAttendance({ data }: DashboardAttendanceProps) {
    const { resolvedTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    const option = useMemo(() => {
        const isDark = resolvedTheme === 'dark'
        const textColor = isDark ? '#a1a1aa' : '#52525b'
        const splitLineColor = isDark ? '#27272a' : '#f4f4f5'

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: isDark ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: isDark ? '#3f3f46' : '#e4e4e7',
                textStyle: { color: isDark ? '#f4f4f5' : '#18181b' },
                formatter: '{b}: {c}%' // 按百分比格式显示
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: data.map(d => d.name),
                axisLabel: { color: textColor, interval: 0, rotate: 15 },
                axisLine: { lineStyle: { color: splitLineColor } }
            },
            yAxis: {
                type: 'value',
                max: 100,
                axisLabel: { color: textColor, formatter: '{value} %' },
                splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } }
            },
            series: [
                {
                    data: data.map(d => d.rate),
                    type: 'bar',
                    barWidth: '40%',
                    itemStyle: {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [{ offset: 0, color: '#10b981' }, { offset: 1, color: '#059669' }]
                        },
                        borderRadius: [4, 4, 0, 0]
                    }
                }
            ]
        }
    }, [data, resolvedTheme])

    if (!mounted) {
        return <div className="w-full h-[300px]" />
    }

    return (
        <div className="w-full h-[300px]">
            <ReactECharts
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
            />
        </div>
    )
}
