"use client"
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTheme } from 'next-themes'

interface DashboardPieProps {
    data: { name: string; value: number }[]
}

// 定义各部门专用主题色（与成员页配色体系保持一致）
const DEPT_COLORS: Record<string, string> = {
    '开发部': '#3b82f6', // 蓝色系
    '设计部': '#ec4899', // 粉色系
    '摄影部': '#f59e0b', // 琥珀色系
    '未分配': '#64748b'  // 石板灰
}

export default function DashboardPie({ data }: DashboardPieProps) {
    const { resolvedTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

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
                        borderWidth: 2,
                        // 根据传入的数据名称(当前部门)动态分配颜色，如果不在字典里则使用默认石板灰
                        color: function (params: { name: string }) {
                            return DEPT_COLORS[params.name] || '#64748b'
                        }
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
