// app\appointments\page.tsx
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

interface Appointment {
  id: string
  user_id: string
  title: string
  description: string
  location_name: string
  latitude: number
  longitude: number
  trigger_distance: number
  priority: "low" | "medium" | "high"
  completed: boolean
  image_url?: string
  voice_note_url?: string
  voice_note_duration?: number
  created_at: string
  updated_at: string
}

export default function AppointmentsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | "prompt">("prompt")

  const notificationServiceRef = useRef<LocationNotificationService | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
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

    getUser()
  }, [router])

  const loadAppointments = async (userId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading appointments:", error)
    } else {
      setAppointments(data || [])

      if (notificationServiceRef.current && data) {
        notificationServiceRef.current.startWatching(data.filter((apt) => !apt.completed))
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    return () => {
      if (notificationServiceRef.current) {
        notificationServiceRef.current.stopWatching()
      }
    }
  }, [])

  const deleteAppointment = async (id: string) => {
    if (!user) return

    const supabase = createClient()
    const { error } = await supabase.from("appointments").delete().eq("id", id).eq("user_id", user.id)

    if (error) {
      console.error("Error deleting appointment:", error)
    } else {
      setAppointments((prev) => prev.filter((apt) => apt.id !== id))
    }
  }

  // Request location permission on component mount
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          })
          setLocationPermission("granted")
        },
        (error) => {
          console.log("Location access denied:", error)
          setLocationPermission("denied")
        },
      )
    }
  }, [])

  // Calculate distance between two points (simplified)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lng2 - lng1) * Math.PI) / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
  }

  const getDistanceToAppointment = (appointment: Appointment) => {
    if (!userLocation) return null
    const distance = calculateDistance(userLocation.lat, userLocation.lng, appointment.latitude, appointment.longitude)
    return distance
  }

  const isNearby = (appointment: Appointment) => {
    const distance = getDistanceToAppointment(appointment)
    return distance !== null && distance <= appointment.trigger_distance
  }

  const formatDistance = (distance: number) => {
    if (distance < 1000) {
      return `${Math.round(distance)}m`
    }
    return `${(distance / 1000).toFixed(1)}km`
  }

  const toggleComplete = async (id: string) => {
    if (!user) return

    const supabase = createClient()
    const appointment = appointments.find((apt) => apt.id === id)
    if (!appointment) return

    const { error } = await supabase
      .from("appointments")
      .update({
        completed: !appointment.completed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Error updating appointment:", error)
    } else {
      const updatedAppointments = appointments.map((apt) =>
        apt.id === id ? { ...apt, completed: !apt.completed } : apt,
      )
      setAppointments(updatedAppointments)

      if (notificationServiceRef.current) {
        notificationServiceRef.current.startWatching(updatedAppointments.filter((apt) => !apt.completed))
      }
    }
  }

  const getPriorityColor = (priority: string) => {
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

  const activeAppointments = appointments.filter((apt) => !apt.completed)
  const completedAppointments = appointments.filter((apt) => apt.completed)
  const nearbyAppointments = activeAppointments.filter(isNearby)

  return (
    <div className="md:pl-64">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Location Reminders</h1>
            <p className="text-muted-foreground mt-1">Geo-tagged appointments that remind you when you're nearby</p>
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
                <DialogTitle>Create Location Reminder</DialogTitle>
                <DialogDescription>
                  Set up a reminder that will notify you when you're near a specific location.
                </DialogDescription>
              </DialogHeader>
              <AppointmentForm
                user={user}
                onClose={() => setIsDialogOpen(false)}
                onSuccess={() => user && loadAppointments(user.id)}
              />
            </DialogContent>
          </Dialog>
        </div>

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
                  <span className="text-sm font-medium text-orange-600">Requesting location access...</span>
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

        {/* Nearby Reminders */}
        {nearbyAppointments.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              You're Near These Locations!
            </h2>
            <div className="grid gap-4">
              {nearbyAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  distance={getDistanceToAppointment(appointment)}
                  isNearby={true}
                  onToggleComplete={toggleComplete}
                  onEdit={setEditingAppointment}
                  onDelete={deleteAppointment}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active Reminders */}
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
              {activeAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  distance={getDistanceToAppointment(appointment)}
                  isNearby={isNearby(appointment)}
                  onToggleComplete={toggleComplete}
                  onEdit={setEditingAppointment}
                  onDelete={deleteAppointment}
                />
              ))}
            </div>
          )}
        </div>

        {/* Completed Reminders */}
        {completedAppointments.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Completed</h2>
            <div className="grid gap-4">
              {completedAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  distance={getDistanceToAppointment(appointment)}
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
              <DialogTitle>Edit Location Reminder</DialogTitle>
              <DialogDescription>Update your location reminder details.</DialogDescription>
            </DialogHeader>
            <AppointmentForm
              user={user}
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
  const formatDistance = (distance: number) => {
    if (distance < 1000) {
      return `${Math.round(distance)}m`
    }
    return `${(distance / 1000).toFixed(1)}km`
  }

  const getPriorityColor = (priority: string) => {
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
                  {appointment.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mt-1">{appointment.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">{appointment.location_name}</span>
                  {distance !== null && (
                    <Badge variant="outline" className="ml-2">
                      {formatDistance(distance)}
                    </Badge>
                  )}
                </div>

                {appointment.voice_note_url && (
                  <div className="mt-3">
                    <VoiceNoteDisplay
                      audioUrl={appointment.voice_note_url}
                      duration={appointment.voice_note_duration}
                    />
                  </div>
                )}

                {appointment.image_url && (
                  <div className="mt-3">
                    <ImageDisplay
                      src={appointment.image_url || "/placeholder.svg"}
                      alt={`Image for ${appointment.title}`}
                      className="max-w-xs"
                    />
                  </div>
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
                  <Badge variant="default" className="bg-orange-600">
                    Nearby!
                  </Badge>
                )}
                <div className="flex flex-col gap-1">
                  {appointment.voice_note_url && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Mic className="h-3 w-3" />
                      Voice
                    </Badge>
                  )}
                  {appointment.image_url && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" />
                      Image
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
    trigger_distance: (appointment?.trigger_distance ?? 100).toString(),
    priority: (appointment?.priority ?? "medium") as "low" | "medium" | "high",
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
      // 1) Determine coordinates: edit -> keep; else address -> geocode; else use device
      let latitude = appointment?.latitude
      let longitude = appointment?.longitude

      if (latitude == null || longitude == null) {
        if (formData.address.trim()) {
          const g = await geocodeAddress(formData.address.trim())
          latitude = g.latitude
          longitude = g.longitude
          if (!formData.location_name) {
            setFormData(p => ({ ...p, location_name: g.name }))
          }
        } else if (userLocation) {
          latitude = userLocation.lat
          longitude = userLocation.lng
        } else {
          throw new Error("No location available. Enter an address or allow location access.")
        }
      }

      // 2) Upload media if provided
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

      // 3) Build payload & save
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        location_name: formData.location_name.trim() || "Pinned location",
        latitude,
        longitude,
        trigger_distance: Number.parseInt(formData.trigger_distance, 10),
        priority: formData.priority,
        image_url: imageUrl,
        voice_note_url: voiceNoteUrl,
        voice_note_duration: voiceNoteDuration,
        updated_at: new Date().toISOString(),
      }

      if (!payload.title || !payload.location_name) throw new Error("Title and Location are required.")

      if (appointment) {
        const { error } = await supabase.from("appointments")
          .update(payload)
          .eq("id", appointment.id)
          .eq("user_id", user.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("appointments")
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

  const handleImageSelect = (file: File, preview: string) => setSelectedImage({ file, preview })
  const handleImageRemove = () => setSelectedImage(null)
  const handleVoiceRecordingComplete = (blob: Blob, duration: number) => setVoiceRecording({ blob, duration })
  const handleVoiceRecordingRemove = () => setVoiceRecording(null)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* (…keep your existing fields exactly as before…) */}
      {/* Title, Description, Location Name, Address (optional), Distance, Priority, VoiceRecorder, ImageUpload */}
      {/* show formError if present and the same footer buttons */}
      {/* --- Title */}
      <div>
        <Label htmlFor="title">Reminder Title</Label>
        <Input id="title" value={formData.title}
          onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))} placeholder="e.g., Pick up prescription" required />
      </div>
      {/* --- Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} rows={2} />
      </div>
      {/* --- Location Name */}
      <div>
        <Label htmlFor="location_name">Location Name</Label>
        <Input id="location_name" value={formData.location_name}
          onChange={(e) => setFormData((p) => ({ ...p, location_name: e.target.value }))} placeholder="e.g., Boots Pharmacy" />
      </div>
      {/* --- Address (optional) */}
      {!appointment && (
        <div>
          <Label htmlFor="address">Address (optional)</Label>
          <Input id="address" value={formData.address}
            onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} placeholder="123 High St, City" />
          <p className="text-xs text-muted-foreground mt-1">If empty, we’ll use your current location.</p>
        </div>
      )}
      {/* --- Distance & Priority */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Reminder Distance</Label>
          <Select value={formData.trigger_distance}
            onValueChange={(v) => setFormData((p) => ({ ...p, trigger_distance: v }))}>
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
          <Select value={formData.priority}
            onValueChange={(v: "low" | "medium" | "high") => setFormData((p) => ({ ...p, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* --- Voice & Image */}
      <div>
        <Label>Voice Note (Optional)</Label>
        <VoiceRecorder
          onRecordingComplete={handleVoiceRecordingComplete}
          onRecordingRemove={handleVoiceRecordingRemove}
          existingRecording={appointment?.voice_note_url}
          className="w-full"
        />
      </div>
      <div>
        <Label>Attach Image (Optional)</Label>
        <ImageUpload
          onImageSelect={handleImageSelect}
          onImageRemove={handleImageRemove}
          currentImage={selectedImage?.preview}
          className="w-full"
        />
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent">Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? (appointment ? "Updating..." : "Creating...") : (appointment ? "Update Reminder" : "Create Reminder")}
        </Button>
      </div>
    </form>
  )
}

