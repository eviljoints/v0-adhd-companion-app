"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Bell, MapPin, Brain, Shield } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function SettingsPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState({
    notifications: {
      appointments: true,
      coaching: true,
      contacts: true,
      email: false,
    },
    location: {
      enabled: true,
      accuracy: "high",
      background: false,
    },
    ai: {
      coaching_frequency: "daily",
      personality: "supportive",
      reminders: true,
    },
    privacy: {
      data_sharing: false,
      analytics: true,
      location_history: true,
    },
  })

  useEffect(() => {
    const supabase = createClient()

    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      // In a real app, you'd load user settings from the database
      setIsLoading(false)
    }

    checkAuth()
  }, [router])

  const updateSetting = (category: string, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category as keyof typeof prev],
        [key]: value,
      },
    }))
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
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Customize your ADHD companion experience</p>
        </div>

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
                  onCheckedChange={(checked) => updateSetting("notifications", "appointments", checked)}
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
                  onCheckedChange={(checked) => updateSetting("notifications", "coaching", checked)}
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
                  onCheckedChange={(checked) => updateSetting("notifications", "contacts", checked)}
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
                  onCheckedChange={(checked) => updateSetting("location", "enabled", checked)}
                />
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Location Accuracy</Label>
                <Select
                  value={settings.location.accuracy}
                  onValueChange={(value) => updateSetting("location", "accuracy", value)}
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
                  <p className="text-sm text-muted-foreground">Allow location access when app is closed</p>
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
                  onValueChange={(value) => updateSetting("ai", "coaching_frequency", value)}
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
                  onValueChange={(value) => updateSetting("ai", "personality", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supportive">Supportive & Encouraging</SelectItem>
                    <SelectItem value="direct">Direct & Practical</SelectItem>
                    <SelectItem value="gentle">Gentle & Understanding</SelectItem>
                    <SelectItem value="energetic">Energetic & Motivating</SelectItem>
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
                Privacy & Data
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

          {/* Save Button */}
          <div className="flex justify-end">
            <Button size="lg">Save All Settings</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
