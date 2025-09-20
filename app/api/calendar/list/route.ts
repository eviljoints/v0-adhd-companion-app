import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || ""
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Google access token" }, { status: 401 })
  }
  const token = auth.replace("Bearer ", "").trim()

  const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const j = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: j.error?.message || "Google API error" }, { status: res.status })
  }

  const items = (j.items || []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
  }))

  return NextResponse.json({ items })
}
