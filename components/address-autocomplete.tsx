"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Location source variants supported by this component
export type Place = {
  name: string
  address: string
  latitude: number
  longitude: number
  source: "mapbox" | "nominatim" | "locationiq"
}

export function AddressAutocomplete({
  value,
  onValueChange,
  userLocation, // { lat, lng } | null
  onPick, // (place: Place) => void
  placeholder = "Start typing an address or place…",
  className,
}: {
  value: string
  onValueChange: (v: string) => void
  userLocation: { lat: number; lng: number } | null
  onPick: (place: Place) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Place[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const q = value.trim()
  const canSearch = q.length >= 2

  useEffect(() => {
    setActiveIdx(0)
    if (!canSearch) {
      setItems([])
      setOpen(false)
      return
    }

    const run = async () => {
      setLoading(true)
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      const params = new URLSearchParams({ q })
      if (userLocation) {
        params.set("lat", String(userLocation.lat))
        // Our API expects `lon` (not `lng`)
        params.set("lon", String(userLocation.lng))
      }

      try {
        const r = await fetch(`/api/places?${params.toString()}`, { signal: ac.signal, cache: "no-store" })
        if (!r.ok) throw new Error(`Places search failed: ${r.status}`)
        const j = await r.json()
        if (ac.signal.aborted) return

        // Defensive parsing (LocationIQ returns an array)
        const raw: any[] = Array.isArray(j) ? j : (j.results || j.features || [])

        const mapped: Place[] = raw
          .map((it: any) => {
            // LocationIQ: lat/lon come as strings
            const lat = Number(
              it.lat ?? it.latitude ?? it.geometry?.lat ?? (Array.isArray(it.center) ? it.center[1] : undefined),
            )
            const lon = Number(
              it.lon ?? it.longitude ?? it.geometry?.lon ?? (Array.isArray(it.center) ? it.center[0] : undefined),
            )

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

            const displayName = it.display_name || it.description || it.address?.label || it.formatted || ""
            const name =
              it.display_place ||
              it.name ||
              it.address?.name ||
              (displayName ? String(displayName).split(",")[0] : "") ||
              q

            return {
              name,
              address: displayName || name || "",
              latitude: lat,
              longitude: lon,
              source: "locationiq" as const,
            }
          })
          .filter(Boolean) as Place[]

        // Deduplicate by lat/lon/name to keep list tidy
        const seen = new Set<string>()
        const deduped = mapped.filter((p) => {
          const k = `${p.name}|${p.latitude.toFixed(6)}|${p.longitude.toFixed(6)}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })

        setItems(deduped)
        setOpen(true)
      } catch {
        if (!ac.signal.aborted) {
          setItems([])
          setOpen(true)
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    }

    const t = setTimeout(run, 220) // debounce
    return () => {
      clearTimeout(t)
      abortRef.current?.abort()
    }
  }, [q, userLocation, canSearch])

  const pick = (idx: number) => {
    const it = items[idx]
    if (!it) return
    onValueChange(it.address)
    onPick(it)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      pick(activeIdx)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => (items.length > 0 || loading) && setOpen(true)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
        role="combobox"
      />
      {open && (items.length > 0 || loading) && (
        <Card className="absolute z-50 mt-1 w-full shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {!loading &&
            items.map((it, idx) => (
              <button
                key={`${it.source}-${it.latitude}-${it.longitude}-${idx}`}
                type="button"
                className={cn("w-full text-left px-3 py-2 hover:bg-accent", idx === activeIdx && "bg-accent")}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => pick(idx)}
              >
                <div className="text-sm font-medium">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.address}</div>
              </button>
            ))}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No suggestions</div>
          )}
        </Card>
      )}
    </div>
  )
}
