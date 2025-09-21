// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") || ""
  if (!q.trim()) return NextResponse.json({ error: "Missing q" }, { status: 400 })

  // 1) Mapbox forward geocode
  const mbToken = process.env.MAPBOX_ACCESS_TOKEN
  if (mbToken) {
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?types=place,poi,address&limit=1&language=en&access_token=${mbToken}`
      const r = await fetch(url, { next: { revalidate: 0 } })
      if (r.ok) {
        const data = await r.json()
        const f = data?.features?.[0]
        if (f?.center?.length === 2) {
          return NextResponse.json({
            latitude: f.center[1],
            longitude: f.center[0],
            name: f.text || f.place_name || q,
            address: f.place_name || q,
          })
        }
      }
    } catch {}
  }

  // 2) Fallback: Nominatim
  const email = process.env.NOMINATIM_EMAIL || ""
  const nomUrl =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}` +
    (email ? `&email=${encodeURIComponent(email)}` : "")
  const rn = await fetch(nomUrl, {
    headers: { "User-Agent": "ADHD-Companion/1.0" },
    next: { revalidate: 0 },
  })
  if (rn.ok) {
    const arr = await rn.json()
    if (arr?.[0]) {
      return NextResponse.json({
        latitude: parseFloat(arr[0].lat),
        longitude: parseFloat(arr[0].lon),
        name: q,
        address: arr[0].display_name || q,
      })
    }
  }

  return NextResponse.json({ error: "No results" }, { status: 404 })
}
