/**
 * 值班系统全局常量
 *
 * 所有与课程节次、工作日相关的常量统一从此文件导出，
 * 避免在各组件和服务文件中重复定义。
 */

// ------------------------------------------------------------------
// 课程节次定义
// ------------------------------------------------------------------

export interface DutyPeriodDef {
    /** 节次编号 1-4 */
    readonly id: number
    /** 短标签，如 "第一节" */
    readonly label: string
    /** 完整标签，如 "第一大节" */
    readonly fullLabel: string
    /** 上课开始时间，如 "08:00" */
    readonly start: string
    /** 下课结束时间，如 "09:35" */
    readonly end: string
    /** 开始时间（分钟数），如 480 */
    readonly startMinutes: number
    /** 结束时间（分钟数），如 575 */
    readonly endMinutes: number
}

export const DUTY_PERIODS: readonly DutyPeriodDef[] = [
    { id: 1, label: "第一节", fullLabel: "第一大节", start: "08:00", end: "09:35", startMinutes: 8 * 60, endMinutes: 9 * 60 + 35 },
    { id: 2, label: "第二节", fullLabel: "第二大节", start: "10:05", end: "11:40", startMinutes: 10 * 60 + 5, endMinutes: 11 * 60 + 40 },
    { id: 3, label: "第三节", fullLabel: "第三大节", start: "13:30", end: "15:05", startMinutes: 13 * 60 + 30, endMinutes: 15 * 60 + 5 },
    { id: 4, label: "第四节", fullLabel: "第四大节", start: "15:35", end: "17:10", startMinutes: 15 * 60 + 35, endMinutes: 17 * 60 + 10 },
]

// ------------------------------------------------------------------
// 工作日定义
// ------------------------------------------------------------------

export interface DutyDayDef {
    /** 星期编号 1-5（周一到周五） */
    readonly id: number
    /** 完整标签，如 "周一" */
    readonly label: string
    /** 短标签，如 "一" */
    readonly short: string
}

export const DUTY_DAYS: readonly DutyDayDef[] = [
    { id: 1, label: "周一", short: "一" },
    { id: 2, label: "周二", short: "二" },
    { id: 3, label: "周三", short: "三" },
    { id: 4, label: "周四", short: "四" },
    { id: 5, label: "周五", short: "五" },
]

// ------------------------------------------------------------------
// 派生的便捷映射表（各消费模块直接使用，避免运行时重复计算）
// ------------------------------------------------------------------

/** 节次结束时间 → 分钟数 */
export const PERIOD_END_MINUTES: Record<number, number> = Object.fromEntries(
    DUTY_PERIODS.map((p) => [p.id, p.endMinutes])
)

/** 节次开始时间 → 分钟数 */
export const PERIOD_START_MINUTES: Record<number, number> = Object.fromEntries(
    DUTY_PERIODS.map((p) => [p.id, p.startMinutes])
)

/** 签到允许的时间窗口 [开始分钟, 结束分钟] */
export const DUTY_SIGN_IN_PERIOD_RANGES: Record<number, [number, number]> = Object.fromEntries(
    DUTY_PERIODS.map((p) => [p.id, [p.startMinutes, p.endMinutes] as [number, number]])
)

/** 节次结束时间 → [小时, 分钟] 元组（供 UI 组件判断节次是否已过） */
export const PERIOD_END_HOUR_MINUTE: Record<number, [number, number]> = Object.fromEntries(
    DUTY_PERIODS.map((p) => [p.id, [Math.floor(p.endMinutes / 60), p.endMinutes % 60] as [number, number]])
)

/** 短名数组，如 ["一", "二", "三", "四", "五"]（向后兼容旧消费方式） */
export const DUTY_DAY_SHORT_LABELS: readonly string[] = DUTY_DAYS.map((d) => d.short)
