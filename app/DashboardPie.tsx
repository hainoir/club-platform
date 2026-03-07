"use client"
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTheme } from 'next-themes'

interface DashboardPieProps {
    data: { name: string; value: number }[]
}

export default function DashboardPie({ data }: DashboardPieProps) {
    const { resolvedTheme } = useTheme()

    const option = useMemo(() => {
        const isDark = resolvedTheme === 'dark'
        const textColor = isDark ? '#a1a1aa' : '#52525b'

        return {
            tooltip: {
                trigger: 'item',
                backgroundColor: isDark ? 'rgba(24, 24, 27, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: isDark ? '#3f3f46' : '#e4e4e7',
                textStyle: { color: isDark ? '#f4f4f5' : '#18181b' }
            },
            legend: {
                bottom: '0%',
                left: 'center',
                textStyle: { color: textColor }
            },
            series: [
                {
                    name: '部门人数',
                    type: 'pie',
                    radius: ['40%', '70%'],
                    avoidLabelOverlap: false,
                    itemStyle: {
                        borderRadius: 10,
                        borderColor: isDark ? '#18181b' : '#ffffff',
                        borderWidth: 2
                    },
                    label: {
                        show: false,
                        position: 'center'
                    },
                    emphasis: {
                        label: {
                            show: true,
                            fontSize: 20,
                            fontWeight: 'bold',
                            color: textColor
                        }
                    },
                    labelLine: {
                        show: false
                    },
                    data: data.length > 0 ? data : [{ name: '暂无数据', value: 0 }]
                }
            ]
        }
    }, [data, resolvedTheme])

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
