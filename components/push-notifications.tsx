// components/push-notifications.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { User } from "@supabase/supabase-js"

export interface LocationReminder {
  id: string
  title: string
  description?: string | null
  latitude: number
  longitude: number
  trigger_distance: number
  completed: boolean
}

export function PushNotificationManager({ user }: { user: User | null }) {
  const [permission, setPermission] = useState<NotificationPermission>(Notification.permission)
  const [swReady, setSwReady] = useState<boolean>(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.register("/sw.js")
          await navigator.serviceWorker.ready
          if (mounted) setSwReady(true)
        }
      } catch (e) {
        console.warn("SW registration failed", e)
      }
    })()
    return () => { mounted = false }
  }, [])

  const requestPermission = async () => {
    try {
      const p = await Notification.requestPermission()
      setPermission(p)
    } catch (e) {
      console.error("Notification permission error", e)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>We’ll alert you when you’re near a saved location.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <span className="text-sm">
          Status: {swReady ? "Service Worker ready" : "Setting up…"} • Permission: {permission}
        </span>
        {permission !== "granted" && (
          <Button size="sm" variant="outline" onClick={requestPermission} className="bg-transparent">
            Enable Notifications
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export class LocationNotificationService {
  private user: User
  private watchId: number | null = null
  private reminders: LocationReminder[] = []
  private lastNotified: Record<string, number> = {}
  private throttleMs = 10 * 60 * 1000 // 10 min

  constructor(user: User) {
    this.user = user
  }

  startWatching(reminders: LocationReminder[]) {
    this.reminders = reminders
    this.stopWatching()
    if (!("geolocation" in navigator)) return

    // Only run when app is open/visible; browsers don’t allow true background geo from SW.
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.checkGeofences(pos.coords.latitude, pos.coords.longitude),
      (err) => console.warn("geo error", err),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
  }

  stopWatching() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
  }

  private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3, toRad = (d: number) => (d * Math.PI) / 180
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  private async showNotification(title: string, body: string) {
    try {
      const reg = await navigator.serviceWorker.ready
      reg.showNotification(title, {
        body,
        icon: "/icon-192x192.jpg",
        badge: "/icon-192x192.jpg",
        tag: "geo-reminder",
        renotify: false,
      })
    } catch (e) {
      console.warn("showNotification error", e)
    }
  }

  private checkGeofences(lat: number, lon: number) {
    const now = Date.now()
    for (const r of this.reminders) {
      if (r.completed) continue
      const d = this.distanceMeters(lat, lon, r.latitude, r.longitude)
      if (d <= r.trigger_distance) {
        const last = this.lastNotified[r.id] ?? 0
        if (now - last > this.throttleMs) {
          this.lastNotified[r.id] = now
          this.showNotification(r.title, r.description || "You’re nearby – want to do this now?")
        }
      }
    }
  }
}
