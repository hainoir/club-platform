"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * 【学习注释：主题能力的客户端封装】
 * `next-themes` 依赖浏览器环境读写主题偏好，因此必须放在客户端组件中。
 * 单独包一层的价值在于：根布局只关心“挂载主题能力”，具体库实现和配置细节集中在一个入口维护。
 */
export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
