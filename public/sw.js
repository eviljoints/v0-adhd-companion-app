// public/sw.js
self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Optional: handle push payloads if you later wire a push service
self.addEventListener("push", (event) => {
  const body = event.data ? event.data.text() : "You have a new notification"
  event.waitUntil(
    self.registration.showNotification("ADHD Companion", {
      body,
      icon: "/icon-192x192.jpg",
      badge: "/icon-192x192.jpg",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true })
      const url = "/appointments"
      for (const client of allClients) {
        if ("focus" in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })(),
  )
})
