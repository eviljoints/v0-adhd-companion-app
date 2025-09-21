// app/api/places/route.ts
import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") || ""
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")
  const token = process.env.MAPBOX_ACCESS_TOKEN

  if (!token) {
    return NextResponse.json({ error: "Missing MAPBOX_ACCESS_TOKEN" }, { status: 500 })
  }
  if (!q.trim()) {
    return NextResponse.json({ features: [] })
  }

  const proximity = lat && lng ? `&proximity=${lng},${lat}` : ""
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?types=place,poi,address` +
    `&language=en` +
    `&autocomplete=true` +
    `&limit=6${proximity}&access_token=${token}`

  const r = await fetch(url, { next: { revalidate: 0 } })
  if (!r.ok) {
    return NextResponse.json({ error: "Mapbox error" }, { status: 502 })
  }

  const data = await r.json()
  const features = (data.features || []).map((f: any) => ({
    id: f.id,
    name: f.text,
    address: f.place_name,
    latitude: f.center?.[1],
    longitude: f.center?.[0],
    source: "mapbox",
  }))
  return NextResponse.json({ features })
}
