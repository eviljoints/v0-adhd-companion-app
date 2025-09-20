// public/sw.js
// --- install/activate (keep yours) ---
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// --- minimal offline cache for app shell ---
const CACHE_NAME = "adhd-shell-v1";
const SHELL = ["/", "/appointments", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin GETs
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Network-first for dynamic pages; cache-first for shell/static
  if (SHELL.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});

// --- push: keep your sound-trigger ---
self.addEventListener("push", (event) => {
  const data = (() => { try { return event.data?.json() || {}; } catch { return {}; } })();
  const title = data.title || "Reminder";
  const body = data.body || "You have a reminder.";
  const tag = data.tag || "reminder";
  const notifData = data.data || {};

  event.waitUntil((async () => {
    await self.registration.showNotification(title, { body, tag, data: notifData, requireInteraction: false });
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "play-sound" });
  })());
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url || "/appointments";
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { c.postMessage({ type: "play-sound" }); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
