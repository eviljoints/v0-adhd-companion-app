"use client";
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

// Community plugin registration (Capacitor v7)
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

/** Geofence shape written by your Appointments page into localStorage */
type SavedFence = {
  id: string;
  title: string;
  lat: number;
  lon: number;     // note: lon (not lng)
  radius: number;  // meters
  location_name?: string | null;
};

// Correct haversine distance in meters
function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function CapacitorClient() {
  // Throttle fence alerts per id (10 minutes)
  const lastNotifiedRef = useRef<Record<string, number>>({});
  // Store watcher id to remove on unmount
  const watcherIdRef = useRef<string | null>(null);
  // Simple callback throttle (don’t run more than every 8s)
  const lastCallbackRef = useRef<number>(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Close in-app browser if your OAuth redirects back into the app
    App.addListener("appUrlOpen", async () => {
      try { await Browser.close(); } catch {}
    });

    (async () => {
      // ---- Push + Local notifications permissions & channel ----
      try {
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
        if (perm.receive === "granted") await PushNotifications.register();
      } catch {}

      try {
        await LocalNotifications.requestPermissions();
        await LocalNotifications.createChannel({
          id: "alarms",
          name: "Alarms",
          description: "Time & location reminders",
          importance: 5,      // IMPORTANCE_HIGH
          vibration: true,
          lights: true,
          // Put a file at android/app/src/main/res/raw/alert.mp3 then uncomment:
          // sound: "alert",
        });
      } catch (e) {
        console.warn("LocalNotifications setup failed", e);
      }
    })();

    (async () => {
      try {
        // NOTE: WatcherOptions for the community plugin do NOT include `minTime`.
        // Use distanceFilter to limit updates; throttle in-code if you want more control.
        const id = await BackgroundGeolocation.addWatcher(
          {
            requestPermissions: true,
            stale: false,
            backgroundTitle: "ADHD Companion",
            backgroundMessage: "Location updates are active.",
            distanceFilter: 25, // meters before another callback
          },
          async (location, error) => {
            if (error || !location) return;

            // Simple callback throttle (every ~8s)
            const nowMs = Date.now();
            if (nowMs - lastCallbackRef.current < 8000) return;
            lastCallbackRef.current = nowMs;

            const { latitude, longitude } = location;
            const acc = typeof (location as any).accuracy === "number" ? (location as any).accuracy as number : 0;

            // Load geofences
            let fences: SavedFence[] = [];
            try {
              const raw = localStorage.getItem("adhd.geofences");
              if (raw) fences = JSON.parse(raw);
            } catch {}
            if (!Array.isArray(fences) || fences.length === 0) return;

            for (const f of fences) {
              const d = metersBetween(latitude, longitude, f.lat, f.lon);
              // Use an accuracy cushion to avoid “off by ~100m”
              const inside = d <= (f.radius + Math.max(acc, 50));
              if (!inside) continue;

              // Per-fence throttle (10 minutes)
              const last = lastNotifiedRef.current[f.id] || 0;
              if (nowMs - last < 10 * 60 * 1000) continue;
              lastNotifiedRef.current[f.id] = nowMs;

              try {
                await LocalNotifications.schedule({
                  notifications: [
                    {
                      id: Math.floor(nowMs % 2147483647),
                      title: f.title || "Nearby Reminder",
                      body: f.location_name || "You're near a saved place",
                      channelId: "alarms",
                      // extra: { type: "nearby", fenceId: f.id },
                      // smallIcon: "ic_notification", // optional; defaults to app icon
                    },
                  ],
                });
              } catch (e) {
                console.warn("LocalNotifications.schedule failed:", e);
              }
            }
          }
        );
        watcherIdRef.current = id;
      } catch (e) {
        console.warn("BackgroundGeolocation.addWatcher failed", e);
      }
    })();

    return () => {
      // Clean up watcher on unmount
      const id = watcherIdRef.current;
      if (id) {
        BackgroundGeolocation.removeWatcher({ id }).catch(() => {});
        watcherIdRef.current = null;
      }
    };
  }, []);

  return null;
}
