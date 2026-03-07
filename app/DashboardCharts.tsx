"use client"
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTheme } from 'next-themes'

interface DashboardChartsProps {
    data: {
        labels: string[]
        members: number[]
        events: number[]
    }
}

export default function DashboardCharts({ data }: DashboardChartsProps) {
    const { resolvedTheme } = useTheme()

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
                axisPointer: {
                    type: 'cross',
                    label: {
                        backgroundColor: isDark ? '#3f3f46' : '#e4e4e7',
                        color: isDark ? '#f4f4f5' : '#18181b'
                    }
                }
            },
            legend: {
                data: ['招新人数', '开展活动'],
                textStyle: { color: textColor },
                top: 0
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: [
                {
                    type: 'category',
                    boundaryGap: false,
                    data: data.labels,
                    axisLabel: { color: textColor },
                    axisLine: { lineStyle: { color: splitLineColor } }
                }
            ],
            yAxis: [
                {
                    type: 'value',
                    axisLabel: { color: textColor },
                    splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } }
                }
            ],
            series: [
                {
                    name: '招新人数',
                    type: 'line',
                    smooth: true,
                    lineStyle: { width: 3, color: '#6366f1' }, // Indigo
                    itemStyle: { color: '#6366f1' }, // 修复数据点的外溢颜色
                    showSymbol: true,
                    symbolSize: 8,
                    areaStyle: {
                        opacity: 0.1,
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [{ offset: 0, color: '#6366f1' }, { offset: 1, color: 'transparent' }]
                        }
                    },
                    emphasis: { focus: 'series' },
                    data: data.members
                },
                {
                    name: '开展活动',
                    type: 'line',
                    smooth: true,
                    lineStyle: { width: 3, color: '#ec4899' }, // Pink
                    itemStyle: { color: '#ec4899' }, // 修复数据点的外溢颜色
                    showSymbol: true,
                    symbolSize: 8,
                    areaStyle: {
                        opacity: 0.1,
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [{ offset: 0, color: '#ec4899' }, { offset: 1, color: 'transparent' }]
                        }
                    },
                    emphasis: { focus: 'series' },
                    data: data.events
                }
            ]
        }
    }, [data, resolvedTheme])

    return (
        <div className="w-full h-[350px]">
            <ReactECharts
                option={option}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
            />
        </div>
    )
}
