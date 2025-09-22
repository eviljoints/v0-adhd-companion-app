"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { AlarmPlugin } from "@/plugins/alarm-plugin";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

type SavedFence = {
  id: string;
  title: string;
  lat: number;
  lon: number;
  radius: number; // meters
  location_name?: string | null;
};

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

async function ringNative({ title, body, loud }: { title: string; body: string; loud: boolean }) {
  try {
    if (loud) {
      // Full-screen Activity (plays alert.mp3 + vibrates)
      await AlarmPlugin.showFullScreenAlarm({ title, body });
    } else {
      // High-importance channel with sound; shows as heads-up and rings
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483647),
            title,
            body,
            channelId: "alarms",
            sound: "alert", // android/res/raw/alert.mp3
            smallIcon: "ic_launcher",
          },
        ],
      });
    }
  } catch (e) {
    console.warn("Native ring failed", e);
  }
}

export default function CapacitorClient() {
  const lastNotifiedRef = useRef<Record<string, number>>({}); // per-fence throttle

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Close in-app browser on deep-links (safe no-op for https OAuth)
    App.addListener("appUrlOpen", async () => {
      try { await Browser.close(); } catch {}
    });

    // Permissions + channel
    (async () => {
      try {
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
        if (perm.receive === "granted") await PushNotifications.register();
      } catch {}

      try {
        await LocalNotifications.requestPermissions();

        // Ensure channel exists (high importance + sound)
        await LocalNotifications.createChannel({
          id: "alarms",
          name: "Alarms",
          description: "Time & location reminders",
          importance: 5, // IMPORTANCE_HIGH
          lights: true,
          vibration: true,
          sound: "alert", // raw/alert.mp3
        });
      } catch (e) {
        console.warn("LocalNotifications setup failed", e);
      }
    })();

    // Background geolocation watcher
    (async () => {
      try {
        await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "Location updates are active.",
            backgroundTitle: "ADHD Companion",
            requestPermissions: true,
            stale: false,
            distanceFilter: 25, // meters before callback again
          },
          async (location, error) => {
            if (error || !location) return;

            const { latitude, longitude, accuracy } = location;
            const acc = Number.isFinite(accuracy as any) ? Number(accuracy) : 0;

            let fences: SavedFence[] = [];
            try {
              const raw = localStorage.getItem("adhd.geofences");
              if (raw) fences = JSON.parse(raw);
            } catch {}

            if (!Array.isArray(fences) || fences.length === 0) return;

            const loud = JSON.parse(localStorage.getItem("adhd.alarm.loud") || "true");
            const now = Date.now();

            for (const f of fences) {
              const d = metersBetween(latitude, longitude, f.lat, f.lon);
              const inside = d <= (f.radius + Math.max(acc, 50)); // accuracy bubble
              if (!inside) continue;

              const last = lastNotifiedRef.current[f.id] || 0;
              if (now - last < 10 * 60 * 1000) continue; // throttle 10 min

              lastNotifiedRef.current[f.id] = now;
              await ringNative({
                title: f.title || "Nearby Reminder",
                body: f.location_name || "You're near a saved place",
                loud,
              });
            }
          }
        );
      } catch (e) {
        console.warn("BG location setup failed", e);
      }
    })();

    return () => {
      // If you store the watcherId from addWatcher, clear it here.
    };
  }, []);

  return null;
}
