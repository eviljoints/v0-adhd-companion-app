// components/alarm-sounder.ts
"use client"

let ctx: AudioContext | null = null
let playing = false
let stopFn: (() => void) | null = null

export async function enableAlarmAudio(): Promise<boolean> {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === "suspended") await ctx.resume()
    return true
  } catch {
    return false
  }
}

export function isAlarmReady() {
  return !!ctx && ctx.state === "running"
}

export async function playAlarmLoop({
  durationMs = 15000,
  cycles = 3,
}: { durationMs?: number; cycles?: number } = {}) {
  if (!ctx) return
  if (playing) return
  playing = true

  const master = ctx.createGain()
  master.gain.value = 0.0001 // start very quiet (avoid jump scare), ramp up
  master.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.type = "square"
  osc.frequency.value = 880 // a sharp beep

  const beepGain = ctx.createGain()
  beepGain.gain.value = 0
  osc.connect(beepGain).connect(master)
  osc.start()

  const start = ctx.currentTime
  const end = start + durationMs / 1000

  // Ramp master volume up
  master.gain.linearRampToValueAtTime(0.6, start + 2) // up to 60%
  master.gain.linearRampToValueAtTime(0.9, start + 6) // up to 90%

  // Pattern: cycles of beep (on 400ms / off 200ms) while frequency steps up to catch attention
  let t = start
  let f = 700
  const step = (durationMs / 1000) / (cycles * 20)
  while (t < end) {
    f += 60
    osc.frequency.setValueAtTime(f, t)

    beepGain.gain.setValueAtTime(1.0, t)
    t += 0.4
    beepGain.gain.setValueAtTime(0.0, t)
    t += 0.2
  }

  stopFn = () => {
    try {
      master.gain.cancelScheduledValues(0)
      master.gain.exponentialRampToValueAtTime(0.0001, ctx!.currentTime + 0.3)
      setTimeout(() => {
        try { osc.stop() } catch {}
        try { osc.disconnect() } catch {}
        try { master.disconnect() } catch {}
      }, 350)
    } catch {}
    playing = false
    stopFn = null
  }

  // Auto-stop at end
  setTimeout(() => { if (playing) stopFn?.() }, durationMs)
}

export function stopAlarm() {
  stopFn?.()
}
