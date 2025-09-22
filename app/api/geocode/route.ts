// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 })

  const key = process.env.LOCATIONIQ_API_KEY!
  const url = `https://us1.locationiq.com/v1/search?format=json&key=${key}&q=${encodeURIComponent(q)}&limit=1`
  const r = await fetch(url, { headers: { accept: "application/json" } })
  const js = await r.json()

  if (!Array.isArray(js) || js.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const place = js[0]
  return NextResponse.json({
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    name: place.display_name,
  })
}
