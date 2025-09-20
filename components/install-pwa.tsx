"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export default function InstallPWA() {
  const [deferred, setDeferred] = useState<any>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      setDeferred(e)
      setVisible(true)
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  if (!visible || !deferred) return null

  return (
    <div className="fixed bottom-4 right-4 rounded-xl border bg-background p-3 shadow-lg">
      <div className="text-sm mb-2">Install ADHD Companion?</div>
      <div className="flex gap-2">
        <Button size="sm" onClick={async () => { deferred.prompt(); setVisible(false) }}>
          Install
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setVisible(false)}>Not now</Button>
      </div>
    </div>
  )
}
