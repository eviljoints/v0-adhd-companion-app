// lib/use-alarm-sound.ts
"use client";

import { useEffect, useState } from "react";

let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Play a short “beep beep” pattern via Web Audio (no asset needed) */
function playBeepPattern() {
  const ac = getCtx();
  if (!ac) return;

  const now = ac.currentTime;

  const makeBeep = (start: number, freq: number, dur = 0.25) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    // Envelope
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  };

  // Two quick beeps
  makeBeep(now + 0.00, 880, 0.22);
  makeBeep(now + 0.30, 660, 0.22);
}

export function useAlarmSound() {
  const [ready, setReady] = useState<boolean>(false);

  // Attempt to unlock on first user interaction
  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlock = async () => {
      const ac = getCtx();
      if (!ac) return;
      if (ac.state === "suspended") {
        try { await ac.resume(); } catch {}
      }
      setReady(true);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    // If already resumed somehow:
    const ac = getCtx();
    if (ac && ac.state === "running") setReady(true);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const ensureReady = async () => {
    const ac = getCtx();
    if (!ac) return false;
    if (ac.state === "suspended") {
      try { await ac.resume(); } catch {}
    }
    setReady(ac.state === "running");
    return ac.state === "running";
  };

  const play = () => {
    // If not unlocked yet, try to resume (silent if blocked)
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === "suspended") {
      // Will likely be no-op until user interacts; still attempt
      void ac.resume().then(() => playBeepPattern());
      return;
    }
    playBeepPattern();
  };

  return { ready, ensureReady, play };
}
