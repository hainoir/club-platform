import type { MetadataRoute } from "next"

/**
 * sitemap.xml 生成
 *
 * 列出应用的主要公开路由，帮助搜索引擎发现页面。
 * 注意：由于本应用大部分页面需要登录，sitemap 仅包含入口页。
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://club-platform.vercel.app"

    return [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 1,
        },
    ]
}
