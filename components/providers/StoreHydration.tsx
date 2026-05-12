"use client"

import { useEffect } from "react"
import { usePreferencesStore } from "@/store/usePreferencesStore"

/**
 * 【学习注释：持久化偏好的安全重水合】
 * 偏好设置使用了 Zustand 持久化能力，但服务端渲染阶段拿不到本地存储里的旧值。
 * 因此这里选择先输出稳定的服务端结果，再在客户端挂载后主动 `rehydrate`，
 * 既避免水合不一致，也能恢复用户之前保存的界面偏好。
 */
export function StoreHydration() {
    useEffect(() => {
        usePreferencesStore.persist.rehydrate()
    }, [])

    return null
}
