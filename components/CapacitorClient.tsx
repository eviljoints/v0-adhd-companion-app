"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Geolocation } from "@capacitor/geolocation";
import { registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

export default function CapacitorClient() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // If you later switch to a custom scheme redirect, keep this:
    App.addListener("appUrlOpen", async ({ url }) => {
      try { await Browser.close(); } catch {}
      // If using custom scheme + exchangeCodeForSession, you'd parse `url` here.
      // For current https redirect, this listener is not required.
    });

    (async () => {
      try {
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
        if (perm.receive === "granted") await PushNotifications.register();
      } catch {}
      try { await LocalNotifications.requestPermissions(); } catch {}
    })();

    (async () => {
      try {
        await Geolocation.requestPermissions();
        await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "Location updates are active.",
            backgroundTitle: "ADHD Companion",
            requestPermissions: true,
            stale: false
          },
          async (location, error) => {
            if (error || !location) return;
            const { latitude, longitude } = location;
            // TODO: compute proximity to your saved locations and
            // LocalNotifications.schedule(...) when inside range.
          }
        );
      } catch (e) {
        console.warn("BG location setup failed", e);
      }
    })();

    return () => { /* cleanup if you stored a watcher id */ };
  }, []);

  return null;
}
