// components/push-notifications.tsx
"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useAlarmSound } from "@/lib/use-alarm-sound";

const PUBLIC_KEY_B64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData =
    typeof window !== "undefined" ? window.atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function PushNotificationManager({ user }: { user: User | null }) {
  const [ready, setReady] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const { ready: soundReady, ensureReady, play } = useAlarmSound();

  // Register SW + subscribe to push
  useEffect(() => {
    (async () => {
      if (!user) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Request permission early
        let perm = Notification.permission;
        if (perm !== "granted") perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") {
          setReady(true);
          return;
        }

        // Subscribe to push
        const sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const newSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY_B64),
          });
          setSubscribed(true);
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: newSub.toJSON() }),
          });
        } else {
          setSubscribed(true);
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
        }
      } catch (e) {
        console.error("Push setup failed:", e);
      } finally {
        setReady(true);
      }
    })();
  }, [user]);

  // Listen for SW “play-sound” messages
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (evt: MessageEvent) => {
      if (evt.data?.type === "play-sound") {
        play(); // beep if page is open
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [play]);

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
    <div className="mt-4 flex items-center gap-3 flex-wrap">
      {!ready ? (
        <p className="text-sm text-muted-foreground">Setting up notifications…</p>
      ) : permission !== "granted" ? (
        <p className="text-sm text-orange-600">Notifications are blocked. Enable them in your browser settings.</p>
      ) : subscribed ? (
        <>
          <p className="text-sm text-green-600">Push notifications enabled</p>
          <Button variant="outline" size="sm" className="bg-transparent" onClick={handleUnsubscribe}>
            Disable
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Push not active.</p>
      )}

      {/* Sound unlock / test */}
      <Button
        variant="outline"
        size="sm"
        className="bg-transparent"
        onClick={async () => {
          await ensureReady();
          play(); // test chime so the user knows it’s enabled
        }}
      >
        {soundReady ? "Test alert sound" : "Enable alert sound"}
      </Button>
    </div>
  );
}
