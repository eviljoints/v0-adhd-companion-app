/* public/sw.js */

/** Keep the service worker alive long enough for async work */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  self.clients.claim();
});

/** Receive push payloads from your Edge Function (web-push) */
self.addEventListener("push", (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Reminder";
    const body = data.body || "You have a due reminder.";
    const tag = data.tag || "adhd-reminder";
    const extra = data.data || {};

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag,
        requireInteraction: !!data.requireInteraction,
        data: extra,
      })
    );
  } catch (e) {
    // Fallback: show a generic notification if JSON parse fails
    event.waitUntil(
      self.registration.showNotification("Reminder", {
        body: "You have a due reminder.",
        tag: "adhd-reminder",
      })
    );
  }
});

/** Focus an existing client or open the app on click */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/appointments";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = allClients.find((c) => c.url.includes(self.registration.scope));
      if (client) {
        client.focus();
        client.postMessage({ type: "OPEN_URL", url });
      } else {
        await self.clients.openWindow(url);
      }
    })()
  );
});
