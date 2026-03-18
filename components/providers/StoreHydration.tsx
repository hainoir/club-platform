"use client"

import { useEffect } from "react"
import { usePreferencesStore } from "@/store/usePreferencesStore"

/**
 * 组件挂载后在客户端触发持久化状态重水合。
 *
 * 偏好设置状态启用了“跳过首次水合”选项，用于保证首次客户端渲染
 * 与服务端输出的页面结构保持一致。
 * 组件挂载后从本地存储加载持久化状态，
 * 从而触发一次安全的重新渲染。
 */
export function StoreHydration() {
    useEffect(() => {
        usePreferencesStore.persist.rehydrate()
    }, [])

    return null
}
