"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type GCalListItem = {
  id: string
  summary: string
  primary?: boolean
}

type GCalEvent = {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
}

export default function CalendarSyncPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [providerToken, setProviderToken] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<GCalListItem[]>([])
  const [calendarId, setCalendarId] = useState<string>("")
  const [events, setEvents] = useState<GCalEvent[]>([])
  const [timeMin, setTimeMin] = useState<string>(() => new Date().toISOString())
  const [timeMax, setTimeMax] = useState<string>(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString()
  })
  const [fetching, setFetching] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/auth/login")

      const { data: { session } } = await supabase.auth.getSession()
      // Supabase returns the Google token as session.provider_token if scopes allow it
      const token = (session as any)?.provider_token as string | undefined
      setProviderToken(token ?? null)
      setLoading(false)

      if (token) {
        await loadCalendars(token)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connectGoogleCalendar() {
    // IMPORTANT: in Supabase Dashboard → Auth → Google, add scope:
    // https://www.googleapis.com/auth/calendar.readonly
    // This will prompt for re-consent.
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/calendar-sync` : undefined,
      },
    })
  }

  async function loadCalendars(token: string) {
    setMsg(null)
    setCalendars([])
    try {
      const res = await fetch("/api/calendar/list", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed to list calendars")
      const items: GCalListItem[] = j.items || []
      setCalendars(items)
      const primary = items.find(c => c.primary) || items[0]
      setCalendarId(primary?.id || "")
    } catch (e: any) {
      setMsg(e.message || "Couldn’t load calendars.")
    }
  }

  async function loadEvents() {
    if (!providerToken || !calendarId) return
    setFetching(true)
    setEvents([])
    setMsg(null)
    try {
      const res = await fetch(`/api/calendar/events?calendarId=${encodeURIComponent(calendarId)}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`, {
        headers: { Authorization: `Bearer ${providerToken}` },
        cache: "no-store",
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed to fetch events")
      setEvents(j.items || [])
      if ((j.items || []).length === 0) setMsg("No events in this range.")
    } catch (e: any) {
      setMsg(e.message || "Couldn’t load events.")
    } finally {
      setFetching(false)
    }
  }

  async function importEvent(ev: GCalEvent) {
    setImportingId(ev.id)
    setMsg(null)
    try {
      // Prefer precise time if present; all-day events only have date
      const startsAtISO =
        ev.start?.dateTime
          ? new Date(ev.start.dateTime).toISOString()
          : ev.start?.date
          ? new Date(ev.start.date + "T09:00:00").toISOString()
          : null

      // Try to geocode the event.location (optional)
      let latitude: number | null = null
      let longitude: number | null = null
      let location_name: string | null = ev.location || null

      if (ev.location) {
        try {
          const g = await (await fetch(`/api/geocode?q=${encodeURIComponent(ev.location)}`, { cache: "no-store" })).json()
          if (g?.latitude && g?.longitude) {
            latitude = g.latitude
            longitude = g.longitude
            if (!location_name) location_name = g.name || ev.location
          }
        } catch { /* ignore geocode errors */ }
      }

      const insert = {
        title: ev.summary || "Calendar event",
        description: ev.description || null,
        location_name,
        latitude,
        longitude,
        trigger_distance: 100, // default proximity
        priority: "medium",
        completed: false,
        scheduled_at: startsAtISO,
        schedule_timezone: ev.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        time_alert_sent: false,
      }

      const supa = createClient()
      const { data: { user } } = await supa.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const { error } = await supa.from("appointments").insert([{ user_id: user.id, ...insert }])
      if (error) throw error

      setMsg(`Imported “${ev.summary || "event"}”`)
    } catch (e: any) {
      setMsg(e.message || "Import failed.")
    } finally {
      setImportingId(null)
    }
  }

  const dateTimeHelp = useMemo(
    () => "Use ISO like 2025-03-01T00:00:00Z. Defaults set to [now, +1 month].",
    []
  )

  return (
    <div className="md:pl-64">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h1 className="text-2xl font-bold">Google Calendar Sync (Read-only)</h1>
            <p className="text-sm text-muted-foreground">
              Connect your Google Calendar, review upcoming events, and import any as location/time reminders.
            </p>

            {!loading && !providerToken && (
              <div className="space-y-3">
                <p className="text-sm">
                  To continue, connect Google with the <code>calendar.readonly</code> permission.
                </p>
                <Button onClick={connectGoogleCalendar}>Connect Google Calendar</Button>
              </div>
            )}

            {!loading && providerToken && (
              <>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Calendar</Label>
                    <Select value={calendarId} onValueChange={setCalendarId}>
                      <SelectTrigger><SelectValue placeholder="Choose a calendar" /></SelectTrigger>
                      <SelectContent>
                        {calendars.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.summary}{c.primary ? " (Primary)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={() => loadCalendars(providerToken!)}>Reload calendars</Button>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>From (timeMin, ISO)</Label>
                    <Input value={timeMin} onChange={(e) => setTimeMin(e.target.value)} />
                  </div>
                  <div>
                    <Label>To (timeMax, ISO)</Label>
                    <Input value={timeMax} onChange={(e) => setTimeMax(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{dateTimeHelp}</p>

                <div className="flex gap-2">
                  <Button disabled={!calendarId || fetching} onClick={loadEvents}>
                    {fetching ? "Loading…" : "Load events"}
                  </Button>
                </div>

                {msg && <p className="text-sm">{msg}</p>}

                <Separator />

                <div className="space-y-3">
                  {events.map((ev) => {
                    const start =
                      ev.start?.dateTime
                        ? new Date(ev.start.dateTime).toLocaleString()
                        : ev.start?.date
                        ? `${ev.start.date} (all-day)`
                        : "—"
                    return (
                      <div key={ev.id} className="p-3 rounded border">
                        <div className="font-medium">{ev.summary || "(no title)"}</div>
                        <div className="text-sm text-muted-foreground">
                          Start: {start}
                          {ev.location ? <> • Location: {ev.location}</> : null}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => importEvent(ev)}
                            disabled={!!importingId}
                          >
                            {importingId === ev.id ? "Importing…" : "Import as Reminder"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
