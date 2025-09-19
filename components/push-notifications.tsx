"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bell, BellOff, Settings } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface PushNotificationProps {
  user: User | null
}

export function PushNotificationManager({ user }: PushNotificationProps) {
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    // Check if push notifications are supported
    setIsSupported("Notification" in window && "serviceWorker" in navigator && "PushManager" in window)

    if ("Notification" in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = async () => {
    if (!isSupported) {
      alert("Push notifications are not supported on this device")
      return
    }

    try {
      const permission = await Notification.requestPermission()
      setPermission(permission)

      if (permission === "granted") {
        await setupPushNotifications()
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error)
    }
  }

  const setupPushNotifications = async () => {
    if (!user) return

    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js")

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""),
      })

      // Save subscription to database
      const supabase = createClient()
      await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        subscription: JSON.stringify(subscription),
        updated_at: new Date().toISOString(),
      })

      setIsSubscribed(true)
    } catch (error) {
      console.error("Error setting up push notifications:", error)
    }
  }

  const disablePushNotifications = async () => {
    if (!user) return

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await subscription.unsubscribe()
        }
      }

      // Remove subscription from database
      const supabase = createClient()
      await supabase.from("push_subscriptions").delete().eq("user_id", user.id)

      setIsSubscribed(false)
    } catch (error) {
      console.error("Error disabling push notifications:", error)
    }
  }

  // Test notification function
  const sendTestNotification = () => {
    if (permission === "granted") {
      new Notification("ADHD Companion Test", {
        body: "Push notifications are working! You'll get reminders when you're near your locations.",
        icon: "/icon-192x192.jpg",
        badge: "/icon-192x192.jpg",
        tag: "test-notification",
      })
    }
  }

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5 text-gray-400" />
            Push Notifications
          </CardTitle>
          <CardDescription>Push notifications are not supported on this device or browser.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Get notified when you're near your location reminders, even when the app is closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            {permission === "granted" ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">Enabled</Badge>
            ) : permission === "denied" ? (
              <Badge className="bg-red-100 text-red-800 border-red-200">Blocked</Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-800 border-gray-200">Not Set</Badge>
            )}
          </div>

          {permission === "granted" && (
            <Button variant="outline" size="sm" onClick={sendTestNotification}>
              Test Notification
            </Button>
          )}
        </div>

        {permission === "default" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enable push notifications to get location-based reminders even when the app is closed.
            </p>
            <Button onClick={requestPermission} className="w-full">
              <Bell className="h-4 w-4 mr-2" />
              Enable Push Notifications
            </Button>
          </div>
        )}

        {permission === "denied" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Push notifications are blocked. To enable them, click the lock icon in your browser's address bar and
              allow notifications.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
              <Settings className="h-4 w-4 mr-2" />
              Refresh After Enabling
            </Button>
          </div>
        )}

        {permission === "granted" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You'll receive notifications when you're within range of your location reminders.
            </p>
            <Button variant="outline" onClick={disablePushNotifications} className="w-full bg-transparent">
              <BellOff className="h-4 w-4 mr-2" />
              Disable Notifications
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Location-based notification service
export class LocationNotificationService {
  private watchId: number | null = null
  private user: User | null = null
  private appointments: any[] = []
  private notifiedAppointments = new Set<string>()

  constructor(user: User | null) {
    this.user = user
  }

  async startWatching(appointments: any[]) {
    this.appointments = appointments

    if (!navigator.geolocation || !this.user) return

    // Clear any existing watch
    this.stopWatching()

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.checkLocationTriggers(position),
      (error) => console.error("Geolocation error:", error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000, // 30 seconds
      },
    )
  }

  stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
  }

  private checkLocationTriggers(position: GeolocationPosition) {
    const userLat = position.coords.latitude
    const userLng = position.coords.longitude

    this.appointments.forEach((appointment) => {
      if (appointment.completed || this.notifiedAppointments.has(appointment.id)) {
        return
      }

      const distance = this.calculateDistance(userLat, userLng, appointment.latitude, appointment.longitude)

      if (distance <= appointment.trigger_distance) {
        this.sendLocationNotification(appointment)
        this.notifiedAppointments.add(appointment.id)

        // Remove from notified set after 1 hour to allow re-notification
        setTimeout(
          () => {
            this.notifiedAppointments.delete(appointment.id)
          },
          60 * 60 * 1000,
        )
      }
    })
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lng2 - lng1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  private sendLocationNotification(appointment: any) {
    if (Notification.permission === "granted") {
      const notification = new Notification(`📍 You're near ${appointment.location_name}!`, {
        body: appointment.title,
        icon: "/icon-192x192.jpg",
        badge: "/icon-192x192.jpg",
        tag: `location-${appointment.id}`,
        requireInteraction: true,
        actions: [
          { action: "complete", title: "Mark Complete" },
          { action: "view", title: "View Details" },
        ],
      })

      notification.onclick = () => {
        window.focus()
        notification.close()
        // Navigate to appointments page
        window.location.href = "/appointments"
      }
    }
  }
}
