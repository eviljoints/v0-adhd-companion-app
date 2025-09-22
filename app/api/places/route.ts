// app/api/places/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || ""
  const lat = req.nextUrl.searchParams.get("lat") // optional biasing
  const lon = req.nextUrl.searchParams.get("lon")
  const key = process.env.LOCATIONIQ_API_KEY!

  const url = new URL("https://api.locationiq.com/v1/autocomplete")
  url.searchParams.set("key", key)
  url.searchParams.set("q", q)
  url.searchParams.set("limit", "5")
  if (lat && lon) {
    url.searchParams.set("lat", lat)
    url.searchParams.set("lon", lon)
  }

  const r = await fetch(url.toString(), { headers: { accept: "application/json" } })
  const data = await r.json()
  return NextResponse.json(data)
}
