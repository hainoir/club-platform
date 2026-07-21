import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",
        name: "社团管理平台",
        short_name: "社团平台",
        description: "面向校园社团的值班、活动与成员管理平台",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#2563eb",
        orientation: "portrait-primary",
        icons: [
            { src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    }
}
