/* public/sw.js */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = (() => {
    try { return event.data?.json() || {}; } catch { return {}; }
  })();

  const title = data.title || "Reminder";
  const body = data.body || "You have a reminder.";
  const tag = data.tag || "reminder";
  const notifData = data.data || {};

  event.waitUntil((async () => {
    // Show notification
    await self.registration.showNotification(title, {
      body,
      tag,
      data: notifData,
      // NOTE: Web Notifications do not support custom sounds cross-browser
      // The OS may play its default sound.
      requireInteraction: false,
    });

    // Ask any open pages to play a local sound
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "play-sound" });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url || "/appointments";
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        // If the app is already open, focus it
        client.postMessage({ type: "play-sound" }); // optional second chime on click
        return client.focus();
      }
    }
    // Otherwise open a new window
    return self.clients.openWindow(url);
  })());
});
