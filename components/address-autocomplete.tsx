"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Place = {
  name: string
  address: string
  latitude: number
  longitude: number
  source: "mapbox" | "nominatim"
}

export function AddressAutocomplete({
  value,
  onValueChange,
  userLocation, // { lat, lng } | null
  onPick,       // (place: Place) => void
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
        params.set("lng", String(userLocation.lng))
      }
      try {
        const r = await fetch(`/api/places?${params.toString()}`, { signal: ac.signal, cache: "no-store" })
        const j = await r.json()
        if (!ac.signal.aborted) {
          setItems(j.features || [])
          setOpen(true)
        }
      } catch {
        if (!ac.signal.aborted) setItems([])
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
      setActiveIdx(i => Math.min(i + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
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
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (items.length > 0 || loading) && (
        <Card className="absolute z-50 mt-1 w-full shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && items.map((it, idx) => (
            <button
              key={`${it.source}-${it.latitude}-${it.longitude}-${idx}`}
              type="button"
              className={cn(
                "w-full text-left px-3 py-2 hover:bg-accent",
                idx === activeIdx && "bg-accent"
              )}
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
