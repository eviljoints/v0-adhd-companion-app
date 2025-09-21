"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase/client"

type GCal = { id: string; summary: string; primary?: boolean }
type GEvent = {
  id: string
  summary?: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

export default function CalendarSyncPage() {
  const [googleToken, setGoogleToken] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<GCal[] | null>(null)
  const [calendarId, setCalendarId] = useState<string>("")
  const [events, setEvents] = useState<GEvent[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loadingCals, setLoadingCals] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [importing, setImporting] = useState(false)
  const supabase = createClient()

  // 1) Get Google access token from Supabase session
  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      // NOTE: you must add the additional scope in Supabase: `https://www.googleapis.com/auth/calendar.readonly`
      setGoogleToken(session?.provider_token ?? null)
    }
    run()
  }, [supabase])

  // 2) If connected, load calendars
  useEffect(() => {
    const run = async () => {
      if (!googleToken) return
      setLoadingCals(true)
      try {
        const res = await fetch("/api/calendar/list", {
          headers: { authorization: `Bearer ${googleToken}` },
          cache: "no-store",
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || "Failed to list calendars")
        setCalendars(j.items || [])
        const prim = (j.items || []).find((c: any) => c.primary) || (j.items || [])[0]
        setCalendarId(prim?.id || "")
      } catch (e) {
        console.error(e)
        setCalendars([])
      } finally {
        setLoadingCals(false)
      }
    }
    run()
  }, [googleToken])

  // 3) Load events when a calendar is picked
  useEffect(() => {
    const run = async () => {
      if (!googleToken || !calendarId) return
      setLoadingEvents(true)
      try {
        const url = `/api/calendar/events?calendarId=${encodeURIComponent(calendarId)}`
        const res = await fetch(url, {
          headers: { authorization: `Bearer ${googleToken}` },
          cache: "no-store",
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || "Failed to list events")
        const items: GEvent[] = j.items || []
        setEvents(items)
        setSelected(Object.fromEntries(items.map((e) => [e.id, true])))
      } catch (e) {
        console.error(e)
        setEvents([])
        setSelected({})
      } finally {
        setLoadingEvents(false)
      }
    }
    run()
  }, [googleToken, calendarId])

  // 4) Begin OAuth with the calendar scope if token missing
  const connectGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
        redirectTo: `${window.location.origin}/calendar-sync`,
      },
    })
  }

  // Helper: normalize a start time (use dateTime if present; if all-day date, set 09:00 local)
  const toWhen = (e: GEvent) => {
    if (e.start?.dateTime) return e.start.dateTime
    if (e.start?.date) {
      const d = new Date(`${e.start.date}T09:00:00`) // local 9AM
      return d.toISOString()
    }
    return null
  }

  // Optional: geocode an event’s free-text location via your existing geocode endpoint
  const geocode = async (q?: string) => {
    if (!q) return { latitude: null, longitude: null, name: null }
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      if (!r.ok) return { latitude: null, longitude: null, name: null }
      const j = await r.json()
      return { latitude: j.latitude ?? null, longitude: j.longitude ?? null, name: j.name ?? null }
    } catch {
      return { latitude: null, longitude: null, name: null }
    }
  }

  // 5) Import selected events as reminders
  const importSelected = async () => {
    setImporting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const toImport = events.filter((e) => selected[e.id])
      for (const e of toImport) {
        const when = toWhen(e)
        const g = await geocode(e.location)

        const payload: any = {
          user_id: user.id,
          title: e.summary || "Calendar event",
          description: e.description || null,
          location_name: g.name || e.location || null,
          latitude: g.latitude,
          longitude: g.longitude,
          trigger_distance: 100,
          priority: "medium",
          completed: false,
          updated_at: new Date().toISOString(),
        }
        if (when) {
          payload.scheduled_at = when
          payload.schedule_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
          payload.time_alert_sent = false
        }

        const { error } = await supabase.from("appointments").insert([payload])
        if (error) throw error
      }
      alert(`Imported ${toImport.length} event(s) into reminders.`)
    } catch (e: any) {
      console.error(e)
      alert(e.message || "Import failed")
    } finally {
      setImporting(false)
    }
  }

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected]
  )

  return (
    <div className="md:pl-64">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h1 className="text-2xl font-bold">Calendar Sync</h1>
            {!googleToken ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect Google Calendar (read-only) to import events as reminders.
                </p>
                <Button onClick={connectGoogle}>Connect Google Calendar</Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Pick a calendar</Label>
                  <Select
                    value={calendarId}
                    onValueChange={(v) => setCalendarId(v)}
                    disabled={loadingCals || !calendars?.length}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose calendar" /></SelectTrigger>
                    <SelectContent>
                      {(calendars || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.summary}{c.primary ? " (Primary)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-2">
                  <h2 className="font-semibold mb-2">Upcoming events</h2>
                  {loadingEvents ? (
                    <p className="text-sm text-muted-foreground">Loading events…</p>
                  ) : events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events found in the next 30 days.</p>
                  ) : (
                    <div className="space-y-2">
                      {events.map((e) => {
                        const when = toWhen(e)
                        return (
                          <label key={e.id} className="flex items-start gap-2 border rounded p-2">
                            <Checkbox
                              checked={!!selected[e.id]}
                              onCheckedChange={(v) =>
                                setSelected((s) => ({ ...s, [e.id]: !!v }))
                              }
                            />
                            <div className="text-sm">
                              <div className="font-medium">{e.summary || "Untitled"}</div>
                              {when && (
                                <div className="text-muted-foreground">
                                  {new Date(when).toLocaleString()}
                                </div>
                              )}
                              {e.location && (
                                <div className="text-muted-foreground">📍 {e.location}</div>
                              )}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <Button disabled={importing || selectedCount === 0} onClick={importSelected}>
                    {importing ? "Importing…" : `Import ${selectedCount} as reminders`}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Tip: if you just enabled the Google “Calendar read-only” scope in Supabase, sign out and back in so we receive a fresh token with that scope.
        </p>
      </div>
    </div>
  )
}
