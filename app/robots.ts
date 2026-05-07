import type { MetadataRoute } from "next"

/**
 * robots.txt 生成
 *
 * 允许搜索引擎爬取公开页面，但阻止索引 API 路由和鉴权页面。
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: ["/api/", "/auth/"],
            },
        ],
    }
}
