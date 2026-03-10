"use client"

import dynamic from "next/dynamic"

const DashboardCharts = dynamic(() => import("@/app/DashboardCharts"), {
    ssr: false,
    loading: () => <div className="w-full h-[350px]" />,
})

const DashboardPie = dynamic(() => import("@/app/DashboardPie"), {
    ssr: false,
    loading: () => <div className="w-full h-[300px]" />,
})

const DashboardAttendance = dynamic(() => import("@/app/DashboardAttendance"), {
    ssr: false,
    loading: () => <div className="w-full h-[300px]" />,
})

interface TrendChartData {
    labels: string[]
    members: number[]
    events: number[]
}

interface PieDataItem {
    name: string
    value: number
}

interface AttendanceDataItem {
    name: string
    rate: number
}

export function LazyTrendChart({ data }: { data: TrendChartData }) {
    return <DashboardCharts data={data} />
}

export function LazyPieChart({ data }: { data: PieDataItem[] }) {
    return <DashboardPie data={data} />
}

export function LazyAttendanceChart({ data }: { data: AttendanceDataItem[] }) {
    return <DashboardAttendance data={data} />
}
