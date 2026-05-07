import type { NextConfig } from "next"

/**
 * Next.js 配置
 *
 * - images: 允许 next/image 加载 Supabase Storage 托管的活动封面图
 * - headers: 为所有路由添加基础安全 HTTP 头
 */
const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "*.supabase.co",
                pathname: "/storage/v1/object/public/**",
            },
        ],
    },

    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                ],
            },
        ]
    },
}

export default nextConfig
