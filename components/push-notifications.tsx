import { useEffect } from "react"

// components/push-notifications.ts
export class LocationNotificationService {
  private user: any
  private watchId: number | null = null

  constructor(user: any) {
    this.user = user
  }

  startWatching(appointments: any[]) {
    if (!("geolocation" in navigator)) return
    this.stopWatching()
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        appointments.forEach((apt) => {
          const d = this.calcDistance(latitude, longitude, apt.latitude, apt.longitude)
          if (d <= apt.trigger_distance) {
            this.notify(apt)
          }
        })
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    )
  }

  stopWatching() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
  }

  private calcDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(1 - a), Math.sqrt(a))
    return R * c
  }

  private async notify(apt: any) {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Nearby Reminder", { body: apt.title || "Reminder" })
    }
  }
}
// components/push-notifications.ts
export function PushNotificationManager({ user }: { user: any }) {
  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission()
    }
  }, [])

  return null
}
