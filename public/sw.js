const DEFAULT_ICON = "/icons/app-icon-192.png"
const DEFAULT_BADGE = "/icons/app-badge-96.png"

self.addEventListener("push", (event) => {
    let payload = {
        notificationId: "club-notification",
        title: "社团管理平台",
        body: "你有一条新的社团通知。",
        url: "/",
        tag: "club-notification",
        level: "info",
    }

    if (event.data) {
        try {
            payload = { ...payload, ...event.data.json() }
        } catch {
            payload.body = event.data.text() || payload.body
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: DEFAULT_ICON,
            badge: DEFAULT_BADGE,
            tag: payload.tag || payload.notificationId,
            renotify: false,
            data: {
                notificationId: payload.notificationId,
                url: payload.url || "/",
                level: payload.level || "info",
            },
        })
    )
})

self.addEventListener("notificationclick", (event) => {
    event.notification.close()
    const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windowClients) => {
            for (const client of windowClients) {
                if (new URL(client.url).origin === self.location.origin) {
                    await client.navigate(targetUrl)
                    return client.focus()
                }
            }
            return clients.openWindow(targetUrl)
        })
    )
})

self.addEventListener("pushsubscriptionchange", (event) => {
    const options = event.oldSubscription?.options
    if (!options) return

    event.waitUntil(
        self.registration.pushManager
            .subscribe({
                userVisibleOnly: options.userVisibleOnly,
                applicationServerKey: options.applicationServerKey,
            })
            .then((subscription) =>
                fetch("/api/push/subscribe", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        subscription: subscription.toJSON(),
                        device: { label: "自动恢复的 Web Push 订阅" },
                    }),
                })
            )
            .catch(() => undefined)
    )
})
