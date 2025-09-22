//app\api\nearby\route.ts
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get("lat") || "")
  const lon = parseFloat(searchParams.get("lon") || "")
  const type = (searchParams.get("type") || "pharmacy").toLowerCase() // pharmacy|supermarket
  if (!Number.isFinite(lat) || !Number.isFinite(lon))
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 })

  // Nominatim "amenity=pharmacy" or "shop=supermarket"
  const filter = type === "pharmacy" ? "amenity=pharmacy" : "shop=supermarket"
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&${filter}&addressdetails=1&extratags=0&namedetails=0&lat=${lat}&lon=${lon}`

  const res = await fetch(url, {
    headers: { "User-Agent": "adhd-companion/1.0 (your-email@example.com)" },
    cache: "no-store",
  })
  if (!res.ok) return NextResponse.json({ error: "fetch failed" }, { status: 500 })
  const rows = await res.json()
  const mapped = rows.map((r: any) => ({
    name: r.display_name?.split(",")[0] || "Place",
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    address: r.display_name || null,
  }))
  return NextResponse.json({ results: mapped })
}
