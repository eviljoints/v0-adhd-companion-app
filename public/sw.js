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
    // Show OS notification (plays system sound/vibrate)
    await self.registration.showNotification(title, {
      body,
      tag,
      data: notifData,
      requireInteraction: true,       // keep visible until user interacts
      renotify: true,
      vibrate: [200, 100, 200, 100, 400], // where supported
    });

    // Ask any open pages to play a local loud sound (WebAudio)
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
        client.postMessage({ type: "play-sound" }); // optional chime on click
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
