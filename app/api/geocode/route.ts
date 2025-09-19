// app/api/geocode/route.ts
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 })

  const mapbox = process.env.MAPBOX_TOKEN
  try {
    if (mapbox) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?limit=1&access_token=${mapbox}`
      const r = await fetch(url, { headers: { "User-Agent": "adhd-companion/1.0" } })
      if (!r.ok) throw new Error(`Mapbox ${r.status}`)
      const j = await r.json()
      const f = j.features?.[0]
      if (!f?.center) return NextResponse.json({ error: "No results" }, { status: 404 })
      return NextResponse.json({
        provider: "mapbox",
        name: f.place_name,
        latitude: f.center[1],
        longitude: f.center[0],
      })
    } else {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`
      const r = await fetch(url, {
        headers: {
          "User-Agent": "adhd-companion/1.0 (mailto:no-reply@example.com)",
          Referer: req.headers.get("origin") ?? "",
        },
      })
      if (!r.ok) throw new Error(`Nominatim ${r.status}`)
      const j = await r.json()
      const f = j?.[0]
      if (!f) return NextResponse.json({ error: "No results" }, { status: 404 })
      return NextResponse.json({
        provider: "nominatim",
        name: f.display_name,
        latitude: parseFloat(f.lat),
        longitude: parseFloat(f.lon),
      })
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
