// components/push-notifications.tsx
"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

/** VAPID public key (Base64 URL-safe). Must be set at build time. */
const PUBLIC_KEY_B64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;

/** Convert Base64URL to Uint8Array for PushManager.subscribe */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window !== "undefined" ? window.atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Small helper: Haversine distance in meters */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Lightweight foreground geofencing: watches the user's position and shows a
 * notification when within trigger_distance of any active appointment.
 *
 * NOTE: works while the app (tab/PWA) is open. For background, rely on push.
 */
export class LocationNotificationService {
  private user: User;
  private watchId: number | null = null;
  private appointments: Array<{
    id: string;
    title: string | null;
    location_name: string | null;
    latitude: number | null;
    longitude: number | null;
    trigger_distance: number;
    completed: boolean;
  }> = [];
  private lastNotifiedAt = new Map<string, number>(); // per-appointment throttle

  constructor(user: User) {
    this.user = user;
  }

  startWatching(appointments: LocationNotificationService["appointments"]) {
    this.appointments = appointments;
    this.stopWatching(); // reset any prior watch

    if (!("geolocation" in navigator)) return;
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") return;

    this.watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // throttle: no more than once per 10 minutes per appointment
        const THROTTLE_MS = 10 * 60 * 1000;

        for (const a of this.appointments) {
          if (a.completed || a.latitude == null || a.longitude == null) continue;
          const d = distanceMeters(lat, lng, a.latitude, a.longitude);
          if (d <= a.trigger_distance) {
            const last = this.lastNotifiedAt.get(a.id) ?? 0;
            const now = Date.now();
            if (now - last < THROTTLE_MS) continue;

            try {
              const reg = await navigator.serviceWorker?.ready;
              const title = a.title || "Reminder nearby";
              const body = a.location_name ? `${a.location_name}` : "You're near a saved place.";
              if (reg?.showNotification) {
                await reg.showNotification(title, {
                  body,
                  tag: `geo-${a.id}`,
                  requireInteraction: false,
                  data: { url: "/appointments", appointmentId: a.id },
                });
              } else {
                new Notification(title, { body, tag: `geo-${a.id}` });
              }
              this.lastNotifiedAt.set(a.id, now);
            } catch {
              // ignore notification errors
            }
          }
        }
      },
      () => {
        // ignore position errors
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
  }

  stopWatching() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

/** Registers the SW, asks for permission, and syncs subscription to your API */
export function PushNotificationManager({ user }: { user: User | null }) {
  const [ready, setReady] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  useEffect(() => {
    (async () => {
      try {
        if (!user) return;
        if (!PUBLIC_KEY_B64) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY missing");
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

        // 1) Register SW (must be at /sw.js)
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // 2) Request Notifications
        let perm = Notification.permission;
        if (perm !== "granted") perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") {
          setReady(true);
          return;
        }

        // 3) Ensure we have a PushSubscription
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY_B64),
          });
        }

        setSubscribed(true);

        // 4) Send to server
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch (e) {
        console.error("Push setup failed:", e);
      } finally {
        setReady(true);
      }
    })();
  }, [user]);

  const handleUnsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
        setSubscribed(false);
      }
    } catch (e) {
      console.error("Unsubscribe failed:", e);
    }
  };

  if (!user) return null;

  return (
    <div className="mt-4">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Setting up notifications…</p>
      ) : permission !== "granted" ? (
        <p className="text-sm text-orange-600">Notifications are blocked. Enable them in your browser settings.</p>
      ) : subscribed ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-green-600">Push notifications enabled</p>
          <Button variant="outline" size="sm" className="bg-transparent" onClick={handleUnsubscribe}>
            Disable
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Push not active.</p>
      )}
    </div>
  );
}
