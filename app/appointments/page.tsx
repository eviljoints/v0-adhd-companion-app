// app/appointments/page.tsx
"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  MapPin, Plus, Navigation, AlertCircle, CheckCircle2, ImageIcon, Edit, Trash2, Mic, BellRing,
} from "lucide-react"
import { ImageUpload, ImageDisplay } from "@/components/image-upload"
import { VoiceRecorder, VoiceNoteDisplay } from "@/components/voice-recorder"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { removeByPublicUrl } from "@/lib/storage"
import { enableAlarmAudio, isAlarmReady, playAlarmLoop, stopAlarm } from "@/components/alarm-sounder"
import { AddressAutocomplete } from "@/components/address-autocomplete"
import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"
import { AlarmPlugin } from "@/plugins/alarm-plugin"

/* -------------------- Types -------------------- */

interface Appointment {
  id: string
  user_id: string
  title: string
  description: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  trigger_distance: number
  priority: "low" | "medium" | "high"
  completed: boolean
  image_url?: string | null
  voice_note_url?: string | null
  voice_note_duration?: number | null
  scheduled_at?: string | null
  schedule_timezone?: string | null
  time_alert_sent?: boolean | null
  created_at: string
  updated_at: string
}

type PickedPlace = {
  name: string
  address: string
  latitude: number
  longitude: number
  source: "mapbox" | "nominatim" | "locationiq"
}

/* -------------------- Helpers -------------------- */

function formatDateTime(iso: string | null | undefined, tz?: string) {
  if (!iso) return ""
  const locale = "en-GB"
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
    ...(tz ? { timeZone: tz } : {}),
  }
  return new Intl.DateTimeFormat(locale, opts).format(new Date(iso))
}
export function utcISOToLocalDateTime(iso: string) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function localDateTimeToUTCISO(local: string) {
  if (!local) return ""
  return new Date(local).toISOString()
}

/* distance helpers */
const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371e3
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/* -------------------- Page -------------------- */

export default function AppointmentsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locAccuracy, setLocAccuracy] = useState<number | null>(null)
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | "prompt">("prompt")

  const [sortBy, setSortBy] = useState<"created" | "scheduled" | "proximity">("created")

  const timeoutsRef = useRef<Record<string, number>>({})
  const supabase = createClient()

  // Loud Alarm toggle (persist)
  const [loudEnabled, setLoudEnabled] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("adhd.alarm.loud") || "true") } catch { return true }
  })
  useEffect(() => {
    localStorage.setItem("adhd.alarm.loud", JSON.stringify(loudEnabled))
  }, [loudEnabled])

  // Hash appointment id -> numeric notification id (stable)
  const toNotifId = (s: string) => {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h) % 2147483647
  }

  // Native ring helper (immediate)
  const ringNow = async (title: string, body: string) => {
    if (Capacitor.isNativePlatform()) {
      if (loudEnabled) {
        try { await AlarmPlugin.showFullScreenAlarm({ title, body }) } catch {}
      } else {
        try {
          await LocalNotifications.schedule({
            notifications: [
              {
                id: Math.floor(Date.now() % 2147483647),
                title, body,
                channelId: "alarms",
                sound: "alert",
                smallIcon: "ic_launcher",
              },
            ],
          })
        } catch {}
      }
    } else {
      // web fallback
      try {
        if (!isAlarmReady()) await enableAlarmAudio()
        playAlarmLoop({ durationMs: 20000, cycles: 4 })
        const reg = await navigator.serviceWorker?.ready
        if (reg?.showNotification) await reg.showNotification(title, { body, requireInteraction: true })
      } catch {}
    }
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      setUser(user)
      await loadAppointments(user.id)
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const loadAppointments = async (userId: string) => {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading appointments:", error)
    } else {
      const rows = (data || []) as Appointment[]
      setAppointments(rows)
      scheduleTimeAlarms(rows) // web fallback + native schedule
      // write geofences for CapacitorClient
      const fences = rows
        .filter((a) => !a.completed && a.latitude != null && a.longitude != null && a.trigger_distance > 0)
        .map((a) => ({
          id: a.id,
          title: a.title || "Reminder",
          lat: a.latitude as number,
          lon: a.longitude as number,
          radius: a.trigger_distance,
          location_name: a.location_name,
        }))
      try { localStorage.setItem("adhd.geofences", JSON.stringify(fences)) } catch {}
    }
    setIsLoading(false)
  }

  // live location (for distance & proximity UI only)
  useEffect(() => {
    if (!("geolocation" in navigator)) return
    let cleared = false

    const onPos = (position: GeolocationPosition) => {
      if (cleared) return
      setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
      setLocAccuracy(Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null)
      setLocationPermission("granted")
    }
    const onErr = () => setLocationPermission("denied")

    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
    const watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
    return () => { cleared = true; if (watchId) navigator.geolocation.clearWatch(watchId) }
  }, [])

  useEffect(() => {
    // cleanup timers on unmount
    return () => { Object.values(timeoutsRef.current).forEach((id) => clearTimeout(id)) }
  }, [])

  /* Distance & proximity (UI only) */
  const getDistanceToAppointment = (a: Appointment) => {
    if (!userLocation || a.latitude == null || a.longitude == null) return null
    const raw = haversineMeters(userLocation.lat, userLocation.lng, a.latitude, a.longitude)
    const acc = locAccuracy ?? 0
    return Math.max(0, raw - acc)
  }
  const isNearby = (a: Appointment) => {
    if (!userLocation || a.latitude == null || a.longitude == null) return false
    const raw = haversineMeters(userLocation.lat, userLocation.lng, a.latitude, a.longitude)
    const acc = locAccuracy ?? 0
    return raw <= a.trigger_distance + acc
  }

  const deleteAppointment = async (apt: Appointment) => {
    if (!user) return
    if (!window.confirm("Delete this reminder? This will also remove any attached image/voice note.")) return

    const { error: delErr } = await supabase.from("appointments").delete().eq("id", apt.id).eq("user_id", user.id)
    if (delErr) {
      console.error("Error deleting appointment:", delErr)
      return
    }

    setAppointments((prev) => prev.filter((a) => a.id !== apt.id))

    if (timeoutsRef.current[apt.id]) {
      clearTimeout(timeoutsRef.current[apt.id])
      delete timeoutsRef.current[apt.id]
    }

    try { if (apt.image_url) await removeByPublicUrl(apt.image_url) } catch {}
    try { if (apt.voice_note_url) await removeByPublicUrl(apt.voice_note_url) } catch {}

    // rewrite fences
    const next = appointments.filter((a) => a.id !== apt.id)
    const fences = next
      .filter((a) => !a.completed && a.latitude != null && a.longitude != null && a.trigger_distance > 0)
      .map((a) => ({
        id: a.id, title: a.title || "Reminder",
        lat: a.latitude as number, lon: a.longitude as number,
        radius: a.trigger_distance, location_name: a.location_name,
      }))
    try { localStorage.setItem("adhd.geofences", JSON.stringify(fences)) } catch {}
  }

  /* -------------------- Time-based alarms -------------------- */

  const showAlarm = async (apt: Appointment) => {
    const title = apt.title || "Reminder"
    const body = apt.location_name ? `${apt.location_name}` : "Time’s up!"
    await ringNow(title, body)

    // Mark as delivered (so we don't repeat)
    await supabase
      .from("appointments")
      .update({ time_alert_sent: true, updated_at: new Date().toISOString() })
      .eq("id", apt.id)
      .eq("user_id", apt.user_id)
  }

  const scheduleTimeAlarms = async (rows: Appointment[]) => {
    // Clear JS timers (web fallback)
    Object.values(timeoutsRef.current).forEach((id) => clearTimeout(id))
    timeoutsRef.current = {}

    const now = Date.now()
    const pending = rows.filter((a) => !a.completed && a.scheduled_at && !a.time_alert_sent)

    // Web/foreground fallback
    pending.forEach((a) => {
      const when = new Date(a.scheduled_at as string).getTime()
      const delay = when - now
      if (delay <= 0) {
        void showAlarm(a)
        return
      }
      const id = window.setTimeout(() => void showAlarm(a), Math.min(delay, 24 * 60 * 60 * 1000))
      timeoutsRef.current[a.id] = id
    })

    // Native background: schedule local notifications (rings with channel sound)
    if (Capacitor.isNativePlatform()) {
      try {
        // Cancel any existing scheduled with same ids
        const pendingNative = await LocalNotifications.getPending()
        const ours = new Set(pending.map((a) => toNotifId(a.id)))
        const toCancel = (pendingNative.notifications || [])
          .filter((n) => n.id != null && ours.has(n.id))
          .map((n) => n.id as number)
        if (toCancel.length) await LocalNotifications.cancel({ notifications: toCancel.map((id) => ({ id })) })

        const notifPayloads = pending.map((a) => {
          const when = new Date(a.scheduled_at as string)
          return {
            id: toNotifId(a.id),
            title: a.title || "Reminder",
            body: a.location_name || "Time’s up!",
            smallIcon: "ic_launcher",
            channelId: "alarms",
            sound: "alert",
            schedule: { at: when }, // fires even if app is closed
          }
        })
        if (notifPayloads.length) {
          await LocalNotifications.schedule({ notifications: notifPayloads })
        }
      } catch (e) {
        console.warn("Native schedule failed", e)
      }
    }
  }

  /* -------------------- Sorting -------------------- */

  const sortAppointments = (list: Appointment[]) => {
    const copy = [...list]
    if (sortBy === "created") {
      copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else if (sortBy === "scheduled") {
      copy.sort((a, b) => {
        const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY
        const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY
        return at - bt
      })
    } else if (sortBy === "proximity") {
      copy.sort((a, b) => {
        const da = (a.latitude != null && a.longitude != null && userLocation)
          ? (getDistanceToAppointment(a) ?? Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY
        const db = (b.latitude != null && b.longitude != null && userLocation)
          ? (getDistanceToAppointment(b) ?? Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY
        return da - db
      })
    }
    return copy
  }

  /* -------------------- Render -------------------- */

  if (isLoading) {
    return (
      <div className="md:pl-64 w-full overflow-x-hidden">
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  const activeAppointments = appointments.filter((a) => !a.completed)
  const completedAppointments = appointments.filter((a) => a.completed)
  const nearbyAppointments = activeAppointments.filter(isNearby)

  return (
    <div className="md:pl-64 w-full overflow-x-hidden">
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Location &amp; Time Reminders</h1>
            <p className="text-muted-foreground mt-1">
              Geo-tagged nudges and optional alarm times that fit ADHD rhythms
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort control */}
            <div className="flex items-center gap-2 mr-2">
              <Label className="text-sm text-muted-foreground">Sort</Label>
              <Select value={sortBy} onValueChange={(v: "created" | "scheduled" | "proximity") => setSortBy(v)}>
                <SelectTrigger className="w-36 sm:w-44">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Created (newest)</SelectItem>
                  <SelectItem value="scheduled">Scheduled time</SelectItem>
                  <SelectItem value="proximity">Proximity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Add */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Reminder
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Reminder</DialogTitle>
                  <DialogDescription>Only the title is required. Everything else is optional.</DialogDescription>
                </DialogHeader>
                <AppointmentForm
                  user={user}
                  userLocation={userLocation}
                  onClose={() => setIsDialogOpen(false)}
                  onSuccess={() => user && loadAppointments(user.id)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Alarm controls */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-2">
                <Navigation className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  {locationPermission === "granted" ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-green-600">Location enabled</span>
                      <Badge variant="secondary">{nearbyAppointments.length} nearby</Badge>
                      {locAccuracy != null && (
                        <span className="text-xs text-muted-foreground">±{Math.round(locAccuracy)}m</span>
                      )}
                    </div>
                  ) : locationPermission === "denied" ? (
                    <span className="text-sm font-medium text-red-600">Location access denied</span>
                  ) : (
                    <span className="text-sm font-medium text-orange-600">Requesting location…</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch id="loud-alarm" checked={loudEnabled} onCheckedChange={setLoudEnabled} />
                  <Label htmlFor="loud-alarm" className="cursor-pointer">Loud Alarm (full-screen)</Label>
                </div>

                {/* Web sound arm/disarm (optional) */}
                {!Capacitor.isNativePlatform() && (
                  <>
                    <Button
                      variant={isAlarmReady() ? "secondary" : "default"}
                      size="sm"
                      onClick={async () => {
                        const ok = await enableAlarmAudio()
                        if (!ok) alert("Couldn’t enable sound. Check browser autoplay settings.")
                      }}
                    >
                      {isAlarmReady() ? "Sound Ready ✅" : "Enable Loud Alarm 🔊"}
                    </Button>
                    {isAlarmReady() && (
                      <Button variant="outline" size="sm" className="bg-transparent" onClick={() => stopAlarm()}>
                        Stop Sound
                      </Button>
                    )}
                  </>
                )}

                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => ringNow("Test Alarm", "This is how your alarm will look & sound")}
                >
                  <BellRing className="h-4 w-4" />
                  Test
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nearby */}
        {nearbyAppointments.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              You’re Near These Locations!
            </h2>
            <div className="grid gap-4">
              {nearbyAppointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  distance={getDistanceToAppointment(a)}
                  isNearby={true}
                  onToggleComplete={(id) => void toggleComplete(id)}
                  onEdit={setEditingAppointment}
                  onDelete={deleteAppointment}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Active Reminders</h2>
          {activeAppointments.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No active reminders. Create your first one!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {sortAppointments(activeAppointments).map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  distance={getDistanceToAppointment(a)}
                  isNearby={isNearby(a)}
                  onToggleComplete={(id) => void toggleComplete(id)}
                  onEdit={setEditingAppointment}
                  onDelete={deleteAppointment}
                />
              ))}
            </div>
          )}
        </div>

        {/* Completed */}
        {completedAppointments.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Completed</h2>
            <div className="grid gap-4">
              {sortAppointments(completedAppointments).map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  distance={getDistanceToAppointment(a)}
                  isNearby={false}
                  onToggleComplete={(id) => void toggleComplete(id)}
                  onEdit={setEditingAppointment}
                  onDelete={deleteAppointment}
                />
              ))}
            </div>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingAppointment} onOpenChange={() => setEditingAppointment(null)}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Reminder</DialogTitle>
              <DialogDescription>Update any detail—you don’t have to fill everything.</DialogDescription>
            </DialogHeader>
            <AppointmentForm
              user={user}
              userLocation={userLocation}
              appointment={editingAppointment}
              onClose={() => setEditingAppointment(null)}
              onSuccess={() => {
                user && loadAppointments(user.id)
                setEditingAppointment(null)
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )

  async function toggleComplete(id: string) {
    if (!user) return
    const current = appointments.find((a) => a.id === id)
    if (!current) return

    const { error } = await supabase
      .from("appointments")
      .update({ completed: !current.completed, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Error updating appointment:", error)
    } else {
      const next = appointments.map((a) => (a.id === id ? { ...a, completed: !a.completed } : a))
      setAppointments(next)
      scheduleTimeAlarms(next)
      // rewrite fences
      const fences = next
        .filter((a) => !a.completed && a.latitude != null && a.longitude != null && a.trigger_distance > 0)
        .map((a) => ({
          id: a.id, title: a.title || "Reminder",
          lat: a.latitude as number, lon: a.longitude as number,
          radius: a.trigger_distance, location_name: a.location_name,
        }))
      try { localStorage.setItem("adhd.geofences", JSON.stringify(fences)) } catch {}
    }
  }
}

/* -------------------- Card -------------------- */

function formatDistance(distance: number) {
  if (distance < 1000) return `${Math.round(distance)}m`
  return `${(distance / 1000).toFixed(1)}km`
}
function getPriorityColor(priority: string) {
  switch (priority) {
    case "high": return "text-red-600 bg-red-50 border-red-200"
    case "medium": return "text-orange-600 bg-orange-50 border-orange-200"
    case "low": return "text-green-600 bg-green-50 border-green-200"
    default: return "text-gray-600 bg-gray-50 border-gray-200"
  }
}

/** ADHD-friendly quick timer */
function QuickTimer({ id, title }: { id: string; title: string }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running || secondsLeft == null) return
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s == null) return null
        if (s > 1) return s - 1
        clearInterval(t)
        setRunning(false)
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Timer done", { body: `${title || "Reminder"} timer finished` })
        }
        return 0
      })
    }, 1000)
    return () => clearInterval(t)
  }, [running, secondsLeft, title])

  const start = (mins: number) => { setSecondsLeft(mins * 60); setRunning(true) }
  const pause = () => setRunning(false)
  const resume = () => secondsLeft != null && secondsLeft > 0 && setRunning(true)
  const reset = () => { setRunning(false); setSecondsLeft(null) }

  const mm = String(Math.floor((secondsLeft ?? 0) / 60)).padStart(2, "0")
  const ss = String((secondsLeft ?? 0) % 60).padStart(2, "0")

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="text-xs">{secondsLeft == null ? "No timer" : `${mm}:${ss}`}</Badge>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => start(5)} className="bg-transparent">5m</Button>
        <Button variant="outline" size="sm" onClick={() => start(15)} className="bg-transparent">15m</Button>
        <Button variant="outline" size="sm" onClick={() => start(25)} className="bg-transparent">25m</Button>
      </div>
      {secondsLeft != null && secondsLeft > 0 ? (
        running ? (
          <Button variant="ghost" size="sm" onClick={pause}>Pause</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={resume}>Resume</Button>
        )
      ) : null}
      <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
    </div>
  )
}

function AppointmentCard({
  appointment, distance, isNearby, onToggleComplete, onEdit, onDelete,
}: {
  appointment: Appointment
  distance: number | null
  isNearby: boolean
  onToggleComplete: (id: string) => void
  onEdit: (appointment: Appointment) => void
  onDelete: (appointment: Appointment) => void
}) {
  const distanceLabel = distance == null ? null : `≈${formatDistance(distance)}`
  return (
    <Card
      className={cn(
        "transition-all duration-200",
        isNearby && !appointment.completed && "ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-950",
        appointment.completed && "opacity-60",
      )}
    >
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleComplete(appointment.id)}
            className={cn("mt-1 flex-shrink-0", appointment.completed && "text-green-600")}
          >
            <CheckCircle2 className={cn("h-5 w-5", appointment.completed && "fill-current")} />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className={cn("font-semibold text-lg break-words", appointment.completed && "line-through text-gray-500")}>
                  {appointment.title || "Untitled reminder"}
                </h3>
                {appointment.description && (
                  <p className="text-gray-600 dark:text-gray-300 mt-1 break-words">{appointment.description}</p>
                )}

                {/* Location line */}
                <div className="flex items-center gap-2 mt-2">
                  {appointment.location_name && (
                    <>
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{appointment.location_name}</span>
                    </>
                  )}
                  {distanceLabel && (
                    <Badge variant="outline" className="ml-2">{distanceLabel}</Badge>
                  )}
                </div>

                {/* Media */}
                {appointment.voice_note_url && (
                  <div className="mt-3">
                    <VoiceNoteDisplay
                      audioUrl={appointment.voice_note_url}
                      duration={appointment.voice_note_duration ?? undefined}
                    />
                  </div>
                )}
                {appointment.image_url && (
                  <div className="mt-3">
                    <ImageDisplay
                      src={appointment.image_url || "/placeholder.svg"}
                      alt={`Image for ${appointment.title || "reminder"}`}
                      className="w-full max-w-full h-auto md:max-w-xs"
                    />
                  </div>
                )}

                {/* ADHD Quick Timer */}
                <QuickTimer id={appointment.id} title={appointment.title} />

                {/* Time alarm info */}
                {appointment.scheduled_at && !appointment.time_alert_sent && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Alarm at {formatDateTime(appointment.scheduled_at, appointment.schedule_timezone ?? undefined)}
                  </p>
                )}
                {appointment.time_alert_sent && (
                  <p className="text-xs text-green-600 mt-2">Alarm sent</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Badge className={getPriorityColor(appointment.priority)}>{appointment.priority}</Badge>

                  {/* Delete */}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(appointment)}
                    className="h-8"
                    aria-label="Delete reminder"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>

                  {/* Edit */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(appointment)}
                    className="h-8"
                    aria-label="Edit reminder"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>
                {isNearby && !appointment.completed && (
                  <Badge variant="default" className="bg-orange-600">Nearby!</Badge>
                )}
                <div className="flex flex-col gap-1">
                  {appointment.voice_note_url && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Mic className="h-3 w-3" /> Voice
                    </Badge>
                  )}
                  {appointment.image_url && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" /> Image
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* -------------------- Form -------------------- */

function AppointmentForm({
  user, userLocation, appointment, onClose, onSuccess,
}: {
  user: User | null
  userLocation: { lat: number; lng: number } | null
  appointment?: Appointment | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    title: appointment?.title ?? "",
    description: appointment?.description ?? "",
    location_name: appointment?.location_name ?? "",
    address: "",
    trigger_distance: String(appointment?.trigger_distance ?? 100),
    priority: (appointment?.priority ?? "medium") as "low" | "medium" | "high",
    scheduled_local: appointment?.scheduled_at ? utcISOToLocalDateTime(appointment.scheduled_at) : "",
  })
  const [pickedPlace, setPickedPlace] = useState<PickedPlace | null>(null)
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string } | null>(
    appointment?.image_url ? { file: new File([], "existing"), preview: appointment.image_url } : null,
  )
  const [voiceRecording, setVoiceRecording] = useState<{ blob: Blob; duration: number } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const supabase = createClient()

  // Fallback geocoder if user typed raw text instead of picking a suggestion
  const geocodeAddress = async (q: string) => {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: "no-store" })
    if (!r.ok) throw new Error((await r.json()).error || "Failed to geocode")
    return (await r.json()) as { latitude: number; longitude: number; name: string }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setIsSubmitting(true)
    setFormError(null)

    try {
      // Coordinates
      let latitude: number | null = appointment?.latitude ?? null
      let longitude: number | null = appointment?.longitude ?? null
      let locationName: string | null = formData.location_name?.trim() || null

      if (pickedPlace) {
        latitude = pickedPlace.latitude
        longitude = pickedPlace.longitude
        if (!locationName) locationName = pickedPlace.name || pickedPlace.address
      } else if (!appointment && formData.address.trim()) {
        const g = await geocodeAddress(formData.address.trim())
        latitude = g.latitude
        longitude = g.longitude
        if (!locationName) locationName = g.name
      } else if (!appointment && userLocation) {
        latitude = userLocation.lat
        longitude = userLocation.lng
      }

      // normalize lon/lat
      if (latitude != null && longitude != null) {
        if (Math.abs(latitude) > 90 && Math.abs(longitude) <= 90) {
          [latitude, longitude] = [longitude, latitude]
        }
        if (longitude > 180 || longitude < -180) {
          longitude = ((longitude + 180) % 360 + 360) % 360 - 180
        }
        if (latitude === 0 && longitude === 0) {
          latitude = null
          longitude = null
        }
      }

      // Media
      let imageUrl = appointment?.image_url || null
      if (selectedImage?.file && selectedImage.file.size > 0) {
        const { uploadToBucket } = await import("@/lib/storage")
        imageUrl = await uploadToBucket("appointment-images", user.id, selectedImage.file)
      }
      let voiceNoteUrl = appointment?.voice_note_url || null
      let voiceNoteDuration = appointment?.voice_note_duration || null
      if (voiceRecording) {
        const { uploadVoiceBlob } = await import("@/lib/storage")
        voiceNoteUrl = await uploadVoiceBlob("voice-notes", user.id, voiceRecording.blob, "webm")
        voiceNoteDuration = voiceRecording.duration
      }

      // Time alarm
      let scheduled_at: string | null = null
      let schedule_timezone: string | null = null
      if (formData.scheduled_local.trim()) {
        scheduled_at = localDateTimeToUTCISO(formData.scheduled_local)
        schedule_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      }

      // Payload
      const payload: Record<string, any> = {
        title: (formData.title || "Untitled reminder").trim(),
        updated_at: new Date().toISOString(),
        trigger_distance: parseInt(formData.trigger_distance, 10) || 100,
        priority: formData.priority,
        completed: appointment?.completed ?? false,
      }
      if (formData.description.trim()) payload.description = formData.description.trim()
      if (locationName) payload.location_name = locationName
      if (latitude != null) payload.latitude = latitude
      if (longitude != null) payload.longitude = longitude
      if (imageUrl) payload.image_url = imageUrl
      if (voiceNoteUrl) payload.voice_note_url = voiceNoteUrl
      if (typeof voiceNoteDuration === "number") payload.voice_note_duration = voiceNoteDuration
      if (scheduled_at) {
        payload.scheduled_at = scheduled_at
        payload.schedule_timezone = schedule_timezone
        payload.time_alert_sent = false
      }

      if (appointment) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", appointment.id).eq("user_id", user.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("appointments").insert([{ user_id: user.id, ...payload }])
        if (error) throw error
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error("Error saving appointment:", err)
      setFormError(err?.message || "Failed to save reminder.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <Label htmlFor="title">Reminder Title</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
          placeholder="e.g., Pick up prescription"
          required
        />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
          rows={2}
        />
      </div>

      {/* Location Name */}
      <div>
        <Label htmlFor="location_name">Location Name (optional)</Label>
        <Input
          id="location_name"
          value={formData.location_name}
          onChange={(e) => setFormData((p) => ({ ...p, location_name: e.target.value }))}
          placeholder="e.g., Boots Pharmacy"
        />
      </div>

      {/* Address autocomplete (create only) */}
      {!appointment && (
        <div>
          <Label htmlFor="address">Address or Place (optional)</Label>
          <AddressAutocomplete
            value={formData.address}
            onValueChange={(v) => {
              setFormData((p) => ({ ...p, address: v }))
              setPickedPlace(null)
            }}
            userLocation={userLocation || null}
            onPick={(place) => {
              setPickedPlace(place)
              setFormData((p) => ({
                ...p,
                address: place.address,
                location_name: p.location_name || place.name,
              }))
            }}
            placeholder="Start typing an address or place…"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Suggestions are biased to your current area. If left empty, we’ll try your current location.
          </p>
        </div>
      )}

      {/* Distance & Priority */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Reminder Distance</Label>
          <Select
            value={formData.trigger_distance}
            onValueChange={(v) => setFormData((p) => ({ ...p, trigger_distance: v }))}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50m (very close)</SelectItem>
              <SelectItem value="100">100m (close)</SelectItem>
              <SelectItem value="200">200m (nearby)</SelectItem>
              <SelectItem value="500">500m (in area)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select
            value={formData.priority}
            onValueChange={(v: "low" | "medium" | "high") => setFormData((p) => ({ ...p, priority: v }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Time Alarm */}
      <div>
        <Label htmlFor="scheduled_local">Alarm time (optional)</Label>
        <Input
          id="scheduled_local"
          type="datetime-local"
          value={formData.scheduled_local}
          onChange={(e) => setFormData((p) => ({ ...p, scheduled_local: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          You’ll get a notification at this time. On Android, it rings even if the app is closed.
        </p>
      </div>

      {/* Voice note */}
      <div>
        <Label>Voice Note (optional)</Label>
        <VoiceRecorder
          onRecordingComplete={(blob, duration) => void setVoiceRecording({ blob, duration })}
          onRecordingRemove={() => setVoiceRecording(null)}
          existingRecording={appointment?.voice_note_url || undefined}
          className="w-full"
        />
      </div>

      {/* Image */}
      <div>
        <Label>Attach Image (optional)</Label>
        <ImageUpload
          onImageSelect={(file, preview) => void setSelectedImage({ file, preview })}
          onImageRemove={() => setSelectedImage(null)}
          currentImage={selectedImage?.preview}
          className="w-full"
        />
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent">Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? (appointment ? "Updating..." : "Creating...") : appointment ? "Update Reminder" : "Create Reminder"}
        </Button>
      </div>
    </form>
  )
}
