// app/api/places/route.ts
import { NextRequest, NextResponse } from "next/server"

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN
const NOMINATIM_EMAIL = process.env.NOMINATIM_EMAIL // optional but recommended for OSM etiquette

type Place = {
  name: string
  address: string
  latitude: number
  longitude: number
  source: "mapbox" | "nominatim"
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim()
    const lat = parseFloat(searchParams.get("lat") || "")
    const lng = parseFloat(searchParams.get("lng") || "")
    const limit = Math.min(parseInt(searchParams.get("limit") || "6", 10) || 6, 10)

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    if (MAPBOX_TOKEN) {
      // ----- Mapbox Autocomplete -----
      const params = new URLSearchParams({
        autocomplete: "true",
        limit: String(limit),
        types: "address,poi,place,locality,neighborhood",
        language: "en",
        access_token: MAPBOX_TOKEN,
      })
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        params.set("proximity", `${lng},${lat}`) // NOTE: lng,lat order for Mapbox
      }
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params.toString()}`
      const r = await fetch(url, { cache: "no-store" })
      if (!r.ok) throw new Error(`Mapbox error: ${r.status}`)
      const j = await r.json()

      const results: Place[] = (j.features || []).map((f: any) => ({
        name: f.text || f.place_name || q,
        address: f.place_name || f.text || q,
        latitude: f.center?.[1],
        longitude: f.center?.[0],
        source: "mapbox" as const,
      })).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))

      return NextResponse.json({ results })
    }

    // ----- Nominatim (OpenStreetMap) fallback -----
    // Bias by a small viewbox around lat/lng if provided
    const params: Record<string, string> = {
      format: "jsonv2",
      q,
      limit: String(limit),
      addressdetails: "1",
      // 'accept-language': 'en', // could add if needed
    }

    let url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams(params).toString()

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      const delta = 0.3 // ~20–30 km radius visual bias box
      const left = lng - delta
      const right = lng + delta
      const top = lat + delta
      const bottom = lat - delta
      url += `&viewbox=${left},${top},${right},${bottom}&bounded=1`
      url += `&lat=${lat}&lon=${lng}`
    }

    const headers: HeadersInit = {
      "User-Agent": `adhd-companion (autocomplete)${NOMINATIM_EMAIL ? ` ${NOMINATIM_EMAIL}` : ""}`,
    }
    const r = await fetch(url, { cache: "no-store", headers })
    if (!r.ok) throw new Error(`Nominatim error: ${r.status}`)
    const j = await r.json()

    const results: Place[] = (Array.isArray(j) ? j : []).map((it: any) => ({
      name: it.display_name?.split(",")[0]?.trim() || it.name || q,
      address: it.display_name || it.name || q,
      latitude: parseFloat(it.lat),
      longitude: parseFloat(it.lon),
      source: "nominatim" as const,
    })).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch places", results: [] }, { status: 500 })
  }
}
