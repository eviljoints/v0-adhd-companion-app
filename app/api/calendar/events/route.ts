import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Google access token" }, { status: 401 })
  }
  const token = auth.replace("Bearer ", "").trim()

  const { searchParams } = new URL(req.url)
  const calendarId = searchParams.get("calendarId")
  const timeMin = searchParams.get("timeMin") || new Date().toISOString()
  const timeMax = searchParams.get("timeMax") || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()

  if (!calendarId) {
    return NextResponse.json({ error: "calendarId is required" }, { status: 400 })
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const j = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: j.error?.message || "Google API error" }, { status: res.status })
  }

  const items = (j.items || []).map((e: any) => ({
    id: e.id,
    status: e.status,
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: e.start,
    end: e.end,
  }))

  return NextResponse.json({ items })
}
