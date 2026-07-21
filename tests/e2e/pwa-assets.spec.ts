import { expect, test } from "@playwright/test"

test("PWA manifest, service worker, and icons are publicly available", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest")
    expect(manifestResponse.ok()).toBeTruthy()
    const manifest = await manifestResponse.json()
    expect(manifest.name).toBe("社团管理平台")
    expect(manifest.display).toBe("standalone")
    expect(manifest.start_url).toBe("/")
    expect(manifest.icons).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ src: "/icons/app-icon-192.png", sizes: "192x192" }),
            expect.objectContaining({ src: "/icons/app-icon-512.png", sizes: "512x512" }),
        ])
    )

    const serviceWorkerResponse = await request.get("/sw.js")
    expect(serviceWorkerResponse.ok()).toBeTruthy()
    expect(await serviceWorkerResponse.text()).toContain('self.addEventListener("push"')

    for (const iconPath of ["/icons/app-icon-192.png", "/icons/app-icon-512.png", "/icons/app-icon-maskable-512.png"]) {
        const iconResponse = await request.get(iconPath)
        expect(iconResponse.ok()).toBeTruthy()
        expect(iconResponse.headers()["content-type"]).toContain("image/png")
    }
})
