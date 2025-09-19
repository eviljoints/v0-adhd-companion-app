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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  MapPin,
  Plus,
  Navigation,
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  MoreVertical,
  Edit,
  Trash2,
  Mic,
} from "lucide-react"
import { ImageUpload, ImageDisplay } from "@/components/image-upload"
import { PushNotificationManager, LocationNotificationService } from "@/components/push-notifications"
import { VoiceRecorder, VoiceNoteDisplay } from "@/components/voice-recorder"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

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
  scheduled_at?: string | null              // <-- new
  schedule_timezone?: string | null         // <-- new
  time_alert_sent?: boolean | null          // <-- new
  created_at: string
  updated_at: string
}

/* -------------------- Helpers -------------------- */

/** For the <input type="datetime-local"> value when editing an existing ISO timestamp */
function utcISOToLocalDateTime(iso: string) {
  const d = new Date(iso)
  const tzOffset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - tzOffset * 60000)
  return local.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"
}

/** Convert a datetime-local value back to UTC ISO */
function localDateTimeToUTCISO(local: string) {
  // local is "YYYY-MM-DDTHH:mm"
  const [date, time] = local.split("T")
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  const localDate = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0)
  return new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000).toISOString()
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
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | "prompt">("prompt")

  // Track scheduled timeouts so we can clear/reschedule
  const timeoutsRef = useRef<Record<string, number>>({})
  const notificationServiceRef = useRef<LocationNotificationService | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      setUser(user)
      await loadAppointments(user.id)

      notificationServiceRef.current = new LocationNotificationService(user)
    }

    init()
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

      // Start geofencing only for items that have coordinates & if Notification permission granted
      if (
        notificationServiceRef.current &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const toWatch = rows.filter((apt) => !apt.completed && apt.latitude != null && apt.longitude != null)
        notificationServiceRef.current.startWatching(toWatch)
      }

      // (Re)schedule time-based alarms
      scheduleTimeAlarms(rows)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    return () => {
      notificationServiceRef.current?.stopWatching()
      // clear all timeouts
      Object.values(timeoutsRef.current).forEach((id) => clearTimeout(id))
    }
  }, [])

  const deleteAppointment = async (id: string) => {
    if (!user) return
    const { error } = await supabase.from("appointments").delete().eq("id", id).eq("user_id", user.id)
    if (error) {
      console.error("Error deleting appointment:", error)
    } else {
      setAppointments((prev) => prev.filter((apt) => apt.id !== id))
      // Clear any timer
      if (timeoutsRef.current[id]) {
        clearTimeout(timeoutsRef.current[id])
        delete timeoutsRef.current[id]
      }
    }
  }

  // Optional device location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
          setLocationPermission("granted")
        },
        () => setLocationPermission("denied"),
      )
    }
  }, [])

  // Distance helpers
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
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

  const getDistanceToAppointment = (a: Appointment) => {
    if (!userLocation || a.latitude == null || a.longitude == null) return null
    return calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude)
  }

  const isNearby = (a: Appointment) => {
    const d = getDistanceToAppointment(a)
    return d !== null && d <= a.trigger_distance
  }

  const toggleComplete = async (id: string) => {
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

      // reschedule geofencing
      if (
        notificationServiceRef.current &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const toWatch = next.filter((apt) => !apt.completed && apt.latitude != null && apt.longitude != null)
        notificationServiceRef.current.startWatching(toWatch)
      }

      // reschedule alarms
      scheduleTimeAlarms(next)
    }
  }

  /* -------------------- Time-based alarms -------------------- */

  const showAlarm = async (apt: Appointment) => {
    const title = apt.title || "Reminder"
    const body = apt.location_name ? `${apt.location_name}` : "Time’s up!"
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        // Prefer service worker (shows even if tab in background)
        const reg = await navigator.serviceWorker?.ready
        if (reg?.showNotification) {
          await reg.showNotification(title, { body, tag: `apt-${apt.id}`, requireInteraction: false })
        } else {
          new Notification(title, { body, tag: `apt-${apt.id}` })
        }
      }
    } catch (e) {
      console.warn("Notification failed:", e)
    }

    // Mark as delivered (so we don’t fire again)
    await supabase
      .from("appointments")
      .update({ time_alert_sent: true, updated_at: new Date().toISOString() })
      .eq("id", apt.id)
      .eq("user_id", apt.user_id)
  }

  const scheduleTimeAlarms = (rows: Appointment[]) => {
    // clear existing
    Object.values(timeoutsRef.current).forEach((id) => clearTimeout(id))
    timeoutsRef.current = {}

    const now = Date.now()
    rows
      .filter((a) => !a.completed && a.scheduled_at && !a.time_alert_sent)
      .forEach((a) => {
        const when = new Date(a.scheduled_at as string).getTime()
        const delay = when - now

        if (delay <= 0) {
          // overdue => fire immediately
          void showAlarm(a)
          return
        }

        // cap super long timeouts (setTimeout max reliable ~24.8 days, we’re way under)
        const id = window.setTimeout(() => {
          void showAlarm(a)
        }, Math.min(delay, 24 * 60 * 60 * 1000))

        timeoutsRef.current[a.id] = id
      })
  }

  /* -------------------- Render -------------------- */

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

  const activeAppointments = appointments.filter((a) => !a.completed)
  const completedAppointments = appointments.filter((a) => a.completed)
  const nearbyAppointments = activeAppointments.filter(isNearby)

  return (
    <div className="md:pl-64">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Location & Time Reminders</h1>
            <p className="text-muted-foreground mt-1">
              Geo-tagged nudges and optional alarm times that fit ADHD rhythms
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Reminder
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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

        {/* Ask permission & register SW */}
        <PushNotificationManager user={user} />

        {/* Location Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Navigation className="h-5 w-5 text-blue-600" />
              <div className="flex-1">
                {locationPermission === "granted" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-green-600">Location access enabled</span>
                    <Badge variant="secondary">{nearbyAppointments.length} nearby</Badge>
                  </div>
                ) : locationPermission === "denied" ? (
                  <span className="text-sm font-medium text-red-600">Location access denied</span>
                ) : (
                  <span className="text-sm font-medium text-orange-600">Requesting location access…</span>
                )}
              </div>
              {locationPermission === "denied" && (
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              )}
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
                  onToggleComplete={toggleComplete}
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
              {activeAppointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  distance={getDistanceToAppointment(a)}
                  isNearby={isNearby(a)}
                  onToggleComplete={toggleComplete}
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
              {completedAppointments.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  distance={getDistanceToAppointment(a)}
                  isNearby={false}
                  onToggleComplete={toggleComplete}
                  onEdit={setEditingAppointment}
                  onDelete={deleteAppointment}
                />
              ))}
            </div>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingAppointment} onOpenChange={() => setEditingAppointment(null)}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
}

/* -------------------- Card -------------------- */

function formatDistance(distance: number) {
  if (distance < 1000) return `${Math.round(distance)}m`
  return `${(distance / 1000).toFixed(1)}km`
}
function getPriorityColor(priority: string) {
  switch (priority) {
    case "high":
      return "text-red-600 bg-red-50 border-red-200"
    case "medium":
      return "text-orange-600 bg-orange-50 border-orange-200"
    case "low":
      return "text-green-600 bg-green-50 border-green-200"
    default:
      return "text-gray-600 bg-gray-50 border-gray-200"
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

  const start = (mins: number) => {
    setSecondsLeft(mins * 60)
    setRunning(true)
  }
  const pause = () => setRunning(false)
  const resume = () => secondsLeft != null && secondsLeft > 0 && setRunning(true)
  const reset = () => {
    setRunning(false)
    setSecondsLeft(null)
  }

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
  appointment,
  distance,
  isNearby,
  onToggleComplete,
  onEdit,
  onDelete,
}: {
  appointment: Appointment
  distance: number | null
  isNearby: boolean
  onToggleComplete: (id: string) => void
  onEdit: (appointment: Appointment) => void
  onDelete: (id: string) => void
}) {
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
                <h3 className={cn("font-semibold text-lg", appointment.completed && "line-through text-gray-500")}>
                  {appointment.title || "Untitled reminder"}
                </h3>
                {appointment.description && (
                  <p className="text-gray-600 dark:text-gray-300 mt-1">{appointment.description}</p>
                )}

                {/* Location line */}
                <div className="flex items-center gap-2 mt-2">
                  {appointment.location_name && (
                    <>
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{appointment.location_name}</span>
                    </>
                  )}
                  {distance !== null && (
                    <Badge variant="outline" className="ml-2">{formatDistance(distance)}</Badge>
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
                      className="max-w-xs"
                    />
                  </div>
                )}

                {/* ADHD Quick Timer */}
                <QuickTimer id={appointment.id} title={appointment.title} />

                {/* Time alarm info */}
                {appointment.scheduled_at && !appointment.time_alert_sent && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Alarm at {new Date(appointment.scheduled_at).toLocaleString()}
                  </p>
                )}
                {appointment.time_alert_sent && (
                  <p className="text-xs text-green-600 mt-2">Alarm sent</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Badge className={getPriorityColor(appointment.priority)}>{appointment.priority}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(appointment)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(appointment.id)} className="text-red-600">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
  user,
  userLocation,
  appointment,
  onClose,
  onSuccess,
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
    scheduled_local: appointment?.scheduled_at ? utcISOToLocalDateTime(appointment.scheduled_at) : "", // <-- local string
  })
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string } | null>(
    appointment?.image_url ? { file: new File([], "existing"), preview: appointment.image_url } : null,
  )
  const [voiceRecording, setVoiceRecording] = useState<{ blob: Blob; duration: number } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const supabase = createClient()

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
      // 1) Coordinates (optional)
      let latitude: number | null = appointment?.latitude ?? null
      let longitude: number | null = appointment?.longitude ?? null

      if (latitude == null || longitude == null) {
        if (formData.address.trim()) {
          const g = await geocodeAddress(formData.address.trim())
          latitude = g.latitude
          longitude = g.longitude
          if (!formData.location_name) {
            setFormData((p) => ({ ...p, location_name: g.name }))
          }
        } else if (userLocation) {
          latitude = userLocation.lat
          longitude = userLocation.lng
        } else {
          latitude = null
          longitude = null
        }
      }

      // 2) Media (optional)
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

      // 3) Time alarm (optional)
      let scheduled_at: string | null = null
      let schedule_timezone: string | null = null
      if (formData.scheduled_local.trim()) {
        scheduled_at = localDateTimeToUTCISO(formData.scheduled_local)
        schedule_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      }

      // 4) Build payload (only include present values)
      const payload: Record<string, any> = {
        title: (formData.title || "Untitled reminder").trim(),
        updated_at: new Date().toISOString(),
        trigger_distance: parseInt(formData.trigger_distance, 10) || 100,
        priority: formData.priority,
      }
      if (formData.description.trim()) payload.description = formData.description.trim()
      if (formData.location_name.trim()) payload.location_name = formData.location_name.trim()
      if (latitude != null) payload.latitude = latitude
      if (longitude != null) payload.longitude = longitude
      if (imageUrl) payload.image_url = imageUrl
      if (voiceNoteUrl) payload.voice_note_url = voiceNoteUrl
      if (typeof voiceNoteDuration === "number") payload.voice_note_duration = voiceNoteDuration
      if (scheduled_at) {
        payload.scheduled_at = scheduled_at
        payload.schedule_timezone = schedule_timezone
        // reset delivery flag on change
        payload.time_alert_sent = false
      }

      if (appointment) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", appointment.id).eq("user_id", user.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("appointments")
          .insert([{ user_id: user.id, completed: false, ...payload }])
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
      {/* Title (required) */}
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

      {/* Description (optional) */}
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
          rows={2}
        />
      </div>

      {/* Location Name (optional) */}
      <div>
        <Label htmlFor="location_name">Location Name (optional)</Label>
        <Input
          id="location_name"
          value={formData.location_name}
          onChange={(e) => setFormData((p) => ({ ...p, location_name: e.target.value }))}
          placeholder="e.g., Boots Pharmacy"
        />
      </div>

      {/* Address (optional) */}
      {!appointment && (
        <div>
          <Label htmlFor="address">Address (optional)</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
            placeholder="123 High St, City"
          />
          <p className="text-xs text-muted-foreground mt-1">
            If empty, we’ll try your current location. If neither is available, we’ll still save (no geofence yet).
          </p>
        </div>
      )}

      {/* Distance & Priority */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Reminder Distance</Label>
          <Select
            value={formData.trigger_distance}
            onValueChange={(v) => setFormData((p) => ({ ...p, trigger_distance: v }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
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
            onValueChange={(v: "low" | "medium" | "high") => setFormData((p) => ({ ...p, priority: v }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Time Alarm (optional) */}
      <div>
        <Label htmlFor="scheduled_local">Alarm time (optional)</Label>
        <Input
          id="scheduled_local"
          type="datetime-local"
          value={formData.scheduled_local}
          onChange={(e) => setFormData((p) => ({ ...p, scheduled_local: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground mt-1">
          You’ll get a notification at this time. Uses your current timezone.
        </p>
      </div>

      {/* Voice note (optional) */}
      <div>
        <Label>Voice Note (optional)</Label>
        <VoiceRecorder
          onRecordingComplete={(blob, duration) => void setVoiceRecording({ blob, duration })}
          onRecordingRemove={() => setVoiceRecording(null)}
          existingRecording={appointment?.voice_note_url || undefined}
          className="w-full"
        />
      </div>

      {/* Image (optional) */}
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
