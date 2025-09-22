"use client"

import { useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"

/**
 * Small helper to request/verify Notification permission and register the SW.
 * You already render <PushNotificationManager user={user} /> in the page.
 */
export function PushNotificationManager({ user }: { user: User | null }) {
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.register("/sw.js")
          const reg = await navigator.serviceWorker.ready
          if (mounted && reg) setReady(true)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const request = async () => {
    try {
      if (typeof Notification === "undefined") return
      const res = await Notification.requestPermission()
      setPerm(res)
    } catch {}
  }

  const test = async () => {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return
      const reg = await navigator.serviceWorker?.ready
      if (reg?.showNotification) {
        await reg.showNotification("ADHD Companion", {
          body: "Test notification — it works! 🎉",
          tag: "test",
        })
      } else {
        new Notification("ADHD Companion", { body: "Test notification — it works! 🎉", tag: "test" })
      }
    } catch {}
  }

  const canNotify = typeof Notification !== "undefined"
  return (
    <div className="flex gap-2 items-center">
      {canNotify ? (
        perm === "granted" ? (
          <button className="inline-flex h-9 items-center rounded-md border px-3 text-sm" onClick={test}>
            Test Push
          </button>
        ) : (
          <button className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground"
                  onClick={request}>
            Enable Push
          </button>
        )
      ) : (
        <span className="text-sm text-muted-foreground">Push not supported</span>
      )}
    </div>
  )
}

/**
 * Lightweight geofence watcher for web (foreground/background via SW push depends
 * on your backend). This class exists so `new LocationNotificationService(user)` works.
 * It uses watchPosition with high accuracy and checks distance against `trigger_distance`.
 */
export class LocationNotificationService {
  private user: User | null
  private watchId: number | null = null
  private targets: Array<{
    id: string
    title?: string | null
    latitude: number
    longitude: number
    trigger_distance: number
    location_name?: string | null
  }> = []
  private alreadyNotified = new Set<string>()

  constructor(user: User | null) {
    this.user = user
  }

  startWatching(targets: Array<{
    id: string
    title?: string | null
    latitude: number | null
    longitude: number | null
    trigger_distance: number
    location_name?: string | null
  }>) {
    // Normalize and keep only valid geolocated targets
    this.targets = (targets || [])
      .filter(t => t.latitude != null && t.longitude != null)
      .map(t => ({
        id: t.id,
        title: t.title ?? "Reminder",
        latitude: t.latitude as number,
        longitude: t.longitude as number,
        trigger_distance: t.trigger_distance,
        location_name: t.location_name ?? null,
      }))

    if (!("geolocation" in navigator)) return

    // Clear previous watch
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }

    // Watch with high accuracy
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      () => {}, // swallow errors
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  stopWatching() {
    if (this.watchId != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(this.watchId)
    }
    this.watchId = null
  }

  private onPosition(position: GeolocationPosition) {
    if (!this.targets.length) return
    const { latitude, longitude, accuracy } = position.coords
    const acc = Number.isFinite(accuracy) ? accuracy : 0

    for (const t of this.targets) {
      const meters = haversineMeters(latitude, longitude, t.latitude, t.longitude)
      // Allow for GPS noise: if within (trigger + accuracy), treat as inside
      if (meters <= t.trigger_distance + acc) {
        if (!this.alreadyNotified.has(t.id)) {
          this.alreadyNotified.add(t.id)
          this.notify(t.title || "Reminder", t.location_name || "You're nearby")
        }
      }
    }
  }

  private async notify(title: string, body: string) {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return
      const reg = await navigator.serviceWorker?.ready
      if (reg?.showNotification) {
        await reg.showNotification(title, { body, tag: `geo-${title}` })
      } else {
        new Notification(title, { body, tag: `geo-${title}` })
      }
    } catch {}
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
