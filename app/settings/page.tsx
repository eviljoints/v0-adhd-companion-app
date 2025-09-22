//app\settings\page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Bell, MapPin, Brain, Shield } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type SettingsShape = {
  notifications: {
    appointments: boolean
    coaching: boolean
    contacts: boolean
    email: boolean
  }
  location: {
    enabled: boolean
    accuracy: "low" | "medium" | "high"
    background: boolean
  }
  ai: {
    coaching_frequency: "hourly" | "daily" | "weekly" | "custom"
    personality: "supportive" | "direct" | "gentle" | "energetic"
    reminders: boolean
  }
  privacy: {
    data_sharing: boolean
    analytics: boolean
    location_history: boolean
  }
}

const DEFAULTS: SettingsShape = {
  notifications: { appointments: true, coaching: true, contacts: true, email: false },
  location: { enabled: true, accuracy: "high", background: false },
  ai: { coaching_frequency: "daily", personality: "supportive", reminders: true },
  privacy: { data_sharing: false, analytics: true, location_history: true },
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<SettingsShape>(DEFAULTS)
  const [serverMsg, setServerMsg] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // ---------- Auth + initial load ----------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      const user = data?.user
      if (!user) {
        router.push("/auth/login")
        return
      }
      setUserId(user.id)

      // Try to load existing settings
      const { data: row, error } = await supabase
        .from("user_settings")
        .select("data")
        .eq("user_id", user.id)
        .single()

      if (!error && row?.data) {
        setSettings({ ...DEFAULTS, ...row.data })
      } else {
        // create a local default; will persist on Save
        setSettings(DEFAULTS)
      }
      setIsLoading(false)
    })()
  }, [router, supabase])

  // ---------- Helpers ----------
  const updateSetting = <K1 extends keyof SettingsShape, K2 extends keyof SettingsShape[K1]>(
    category: K1,
    key: K2,
    value: SettingsShape[K1][K2],
  ) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value,
      },
    }))
  }

  async function ensureNotificationPermission(): Promise<boolean> {
    try {
      if (typeof Notification === "undefined") return false
      if (Notification.permission === "granted") return true
      const res = await Notification.requestPermission()
      // Optionally register service worker (if not already)
      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.register("/sw.js")
        } catch {}
      }
      return res === "granted"
    } catch {
      return false
    }
  }

  async function ensureLocationPermission(): Promise<boolean> {
    if (!("geolocation" in navigator)) return false
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 10000 },
      )
    })
  }

  async function onToggleNotifications(checked: boolean) {
    // Ask for browser permission if turning on any push-like channels
    if (checked) {
      const ok = await ensureNotificationPermission()
      if (!ok) {
        setServerMsg("Notifications are blocked by the browser. Check site permissions.")
      }
    }
  }

  async function onToggleLocation(checked: boolean) {
    if (checked) {
      const ok = await ensureLocationPermission()
      if (!ok) {
        setServerMsg("Location permission denied. Enable it in your browser settings.")
      }
    }
  }

  async function handleSave() {
    if (!userId) return
    setIsSaving(true)
    setServerMsg(null)
    try {
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          data: settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      if (error) throw error
      setServerMsg("Settings saved.")
    } catch (e: any) {
      setServerMsg(e?.message || "Failed to save settings.")
    } finally {
      setIsSaving(false)
    }
  }

  async function testNotification() {
    const ok = await ensureNotificationPermission()
    if (!ok) {
      setServerMsg("Notifications are blocked by the browser.")
      return
    }
    try {
      const reg = await navigator.serviceWorker?.ready
      if (reg?.showNotification) {
        await reg.showNotification("ADHD Companion", {
          body: "Test notification — if you see this, you’re set! 🎉",
          tag: "test",
        })
      } else {
        new Notification("ADHD Companion", { body: "Test notification — it works! 🎉", tag: "test" })
      }
    } catch {
      setServerMsg("Could not show a notification (service worker/permissions?).")
    }
  }

  if (isLoading) {
    return (
      <div className="md:pl-64">
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="md:pl-64">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Customize your ADHD companion experience</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testNotification}>Test push</Button>
            <Button size="lg" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save All Settings"}
            </Button>
          </div>
        </div>

        {serverMsg && (
          <div className="text-sm">{serverMsg}</div>
        )}

        <div className="grid gap-6">
          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>Manage how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Appointment Reminders</Label>
                  <p className="text-sm text-muted-foreground">Get notified when you're near appointment locations</p>
                </div>
                <Switch
                  checked={settings.notifications.appointments}
                  onCheckedChange={async (checked) => {
                    updateSetting("notifications", "appointments", checked)
                    await onToggleNotifications(checked)
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>AI Coaching</Label>
                  <p className="text-sm text-muted-foreground">Receive daily mantras and motivational messages</p>
                </div>
                <Switch
                  checked={settings.notifications.coaching}
                  onCheckedChange={async (checked) => {
                    updateSetting("notifications", "coaching", checked)
                    await onToggleNotifications(checked)
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>VIP Contact Reminders</Label>
                  <p className="text-sm text-muted-foreground">Reminders to reach out to important people</p>
                </div>
                <Switch
                  checked={settings.notifications.contacts}
                  onCheckedChange={async (checked) => {
                    updateSetting("notifications", "contacts", checked)
                    await onToggleNotifications(checked)
                  }}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                </div>
                <Switch
                  checked={settings.notifications.email}
                  onCheckedChange={(checked) => updateSetting("notifications", "email", checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location Services
              </CardTitle>
              <CardDescription>Configure location-based features and privacy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Location Services</Label>
                  <p className="text-sm text-muted-foreground">Required for geo-tagged appointments</p>
                </div>
                <Switch
                  checked={settings.location.enabled}
                  onCheckedChange={async (checked) => {
                    updateSetting("location", "enabled", checked)
                    await onToggleLocation(checked)
                  }}
                />
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Location Accuracy</Label>
                <Select
                  value={settings.location.accuracy}
                  onValueChange={(value: SettingsShape["location"]["accuracy"]) =>
                    updateSetting("location", "accuracy", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (City level)</SelectItem>
                    <SelectItem value="medium">Medium (Neighborhood)</SelectItem>
                    <SelectItem value="high">High (Precise location)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Background Location</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow location checks while the app is in the background (browser support varies)
                  </p>
                </div>
                <Switch
                  checked={settings.location.background}
                  onCheckedChange={(checked) => updateSetting("location", "background", checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* AI Coach */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Coach
              </CardTitle>
              <CardDescription>Personalize your AI coaching experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Coaching Frequency</Label>
                <Select
                  value={settings.ai.coaching_frequency}
                  onValueChange={(value: SettingsShape["ai"]["coaching_frequency"]) =>
                    updateSetting("ai", "coaching_frequency", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>AI Personality</Label>
                <Select
                  value={settings.ai.personality}
                  onValueChange={(value: SettingsShape["ai"]["personality"]) =>
                    updateSetting("ai", "personality", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supportive">Supportive &amp; Encouraging</SelectItem>
                    <SelectItem value="direct">Direct &amp; Practical</SelectItem>
                    <SelectItem value="gentle">Gentle &amp; Understanding</SelectItem>
                    <SelectItem value="energetic">Energetic &amp; Motivating</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Smart Reminders</Label>
                  <p className="text-sm text-muted-foreground">AI-powered contextual reminders</p>
                </div>
                <Switch
                  checked={settings.ai.reminders}
                  onCheckedChange={(checked) => updateSetting("ai", "reminders", checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Privacy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Privacy &amp; Data
              </CardTitle>
              <CardDescription>Control how your data is used and shared</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Anonymous Data Sharing</Label>
                  <p className="text-sm text-muted-foreground">Help improve the app with anonymous usage data</p>
                </div>
                <Switch
                  checked={settings.privacy.data_sharing}
                  onCheckedChange={(checked) => updateSetting("privacy", "data_sharing", checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Analytics</Label>
                  <p className="text-sm text-muted-foreground">Allow analytics to improve your experience</p>
                </div>
                <Switch
                  checked={settings.privacy.analytics}
                  onCheckedChange={(checked) => updateSetting("privacy", "analytics", checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Location History</Label>
                  <p className="text-sm text-muted-foreground">Store location history for better recommendations</p>
                </div>
                <Switch
                  checked={settings.privacy.location_history}
                  onCheckedChange={(checked) => updateSetting("privacy", "location_history", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
