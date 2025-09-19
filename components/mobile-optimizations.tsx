"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronUp, WifiOff, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"

// Mobile-specific hook for detecting device capabilities
export function useMobileCapabilities() {
  const [capabilities, setCapabilities] = useState({
    isOnline: true,
    isTouchDevice: false,
    hasVibration: false,
    isStandalone: false,
    orientation: "portrait" as "portrait" | "landscape",
  })

  useEffect(() => {
    const updateCapabilities = () => {
      setCapabilities({
        isOnline: navigator.onLine,
        isTouchDevice: "ontouchstart" in window || navigator.maxTouchPoints > 0,
        hasVibration: "vibrate" in navigator,
        isStandalone: window.matchMedia("(display-mode: standalone)").matches,
        orientation: window.innerHeight > window.innerWidth ? "portrait" : "landscape",
      })
    }

    updateCapabilities()

    window.addEventListener("online", updateCapabilities)
    window.addEventListener("offline", updateCapabilities)
    window.addEventListener("resize", updateCapabilities)

    return () => {
      window.removeEventListener("online", updateCapabilities)
      window.removeEventListener("offline", updateCapabilities)
      window.removeEventListener("resize", updateCapabilities)
    }
  }, [])

  return capabilities
}

// Haptic feedback utility
export function useHapticFeedback() {
  const vibrate = (pattern: number | number[] = 50) => {
    if ("vibrate" in navigator) {
      navigator.vibrate(pattern)
    }
  }

  return { vibrate }
}

// Pull-to-refresh component
interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  className?: string
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef(0)
  const currentY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY
      setIsPulling(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return

    currentY.current = e.touches[0].clientY
    const distance = Math.max(0, currentY.current - startY.current)

    if (distance > 0) {
      e.preventDefault()
      setPullDistance(Math.min(distance * 0.5, 100))
    }
  }

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }

    setIsPulling(false)
    setPullDistance(0)
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-center transition-transform duration-200 bg-blue-50 border-b",
          pullDistance > 0 ? "translate-y-0" : "-translate-y-full",
        )}
        style={{ height: `${Math.min(pullDistance, 60)}px` }}
      >
        {isRefreshing ? (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        ) : (
          <ChevronUp className={cn("h-6 w-6 text-blue-600 transition-transform", pullDistance > 60 && "rotate-180")} />
        )}
      </div>

      <div style={{ transform: `translateY(${Math.min(pullDistance, 60)}px)` }}>{children}</div>
    </div>
  )
}

// Mobile-optimized floating action button
interface FloatingActionButtonProps {
  onClick: () => void
  icon: React.ReactNode
  label?: string
  className?: string
  variant?: "primary" | "secondary"
}

export function FloatingActionButton({
  onClick,
  icon,
  label,
  className,
  variant = "primary",
}: FloatingActionButtonProps) {
  const { vibrate } = useHapticFeedback()

  const handleClick = () => {
    vibrate(50)
    onClick()
  }

  return (
    <Button
      onClick={handleClick}
      className={cn(
        "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 transition-all duration-200 active:scale-95",
        variant === "primary" && "bg-blue-600 hover:bg-blue-700",
        variant === "secondary" && "bg-gray-600 hover:bg-gray-700",
        label && "w-auto px-4 gap-2",
        className,
      )}
      size="icon"
    >
      {icon}
      {label && <span className="text-sm font-medium">{label}</span>}
    </Button>
  )
}

// Mobile-optimized bottom sheet
interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  snapPoints?: number[]
}

export function BottomSheet({ isOpen, onClose, children, title, snapPoints = [0.3, 0.6, 0.9] }: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const currentY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    currentY.current = e.touches[0].clientY
  }

  const handleTouchEnd = () => {
    if (!isDragging) return

    const deltaY = currentY.current - startY.current
    const threshold = 50

    if (deltaY > threshold) {
      // Swipe down - close or snap to lower position
      if (currentSnap === 0) {
        onClose()
      } else {
        setCurrentSnap(Math.max(0, currentSnap - 1))
      }
    } else if (deltaY < -threshold) {
      // Swipe up - snap to higher position
      setCurrentSnap(Math.min(snapPoints.length - 1, currentSnap + 1))
    }

    setIsDragging(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl shadow-xl transition-transform duration-300"
        style={{
          height: `${snapPoints[currentSnap] * 100}vh`,
          transform: isDragging ? "none" : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div className="px-4 pb-4 border-b">
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}

// Connection status indicator
export function ConnectionStatus() {
  const { isOnline } = useMobileCapabilities()

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-2 text-sm z-50">
      <div className="flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4" />
        You're offline. Some features may not work.
      </div>
    </div>
  )
}

// Mobile-optimized card with touch feedback
interface TouchCardProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  hapticFeedback?: boolean
}

export function TouchCard({ children, onClick, className, hapticFeedback = true }: TouchCardProps) {
  const { vibrate } = useHapticFeedback()
  const [isPressed, setIsPressed] = useState(false)

  const handleTouchStart = () => {
    setIsPressed(true)
    if (hapticFeedback) vibrate(25)
  }

  const handleTouchEnd = () => {
    setIsPressed(false)
  }

  const handleClick = () => {
    if (onClick) onClick()
  }

  return (
    <Card
      className={cn(
        "transition-all duration-150 cursor-pointer",
        isPressed && "scale-98 shadow-sm",
        onClick && "active:scale-98",
        className,
      )}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </Card>
  )
}

// Mobile app install prompt
export function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const { isStandalone } = useMobileCapabilities()

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPrompt(true)
    }

    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === "accepted") {
      setShowPrompt(false)
    }

    setDeferredPrompt(null)
  }

  if (isStandalone || !showPrompt) return null

  return (
    <Card className="fixed bottom-20 left-4 right-4 z-40 md:hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <Smartphone className="h-8 w-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-sm">Install ADHD Companion</h3>
            <p className="text-xs text-gray-600">Add to home screen for quick access</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPrompt(false)}>
              Later
            </Button>
            <Button size="sm" onClick={handleInstall}>
              Install
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Mobile-optimized swipe actions
interface SwipeActionsProps {
  children: React.ReactNode
  leftActions?: Array<{
    icon: React.ReactNode
    label: string
    color: string
    action: () => void
  }>
  rightActions?: Array<{
    icon: React.ReactNode
    label: string
    color: string
    action: () => void
  }>
  className?: string
}

export function SwipeActions({ children, leftActions = [], rightActions = [], className }: SwipeActionsProps) {
  const [swipeDistance, setSwipeDistance] = useState(0)
  const [isSwipping, setIsSwipping] = useState(false)
  const startX = useRef(0)
  const currentX = useRef(0)
  const { vibrate } = useHapticFeedback()

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    setIsSwipping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwipping) return

    currentX.current = e.touches[0].clientX
    const distance = currentX.current - startX.current
    setSwipeDistance(distance)
  }

  const handleTouchEnd = () => {
    const threshold = 80

    if (Math.abs(swipeDistance) > threshold) {
      vibrate(50)

      if (swipeDistance > 0 && leftActions.length > 0) {
        leftActions[0].action()
      } else if (swipeDistance < 0 && rightActions.length > 0) {
        rightActions[0].action()
      }
    }

    setIsSwipping(false)
    setSwipeDistance(0)
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Left actions */}
      {leftActions.length > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 flex items-center"
          style={{
            width: Math.max(0, swipeDistance),
            backgroundColor: leftActions[0].color,
          }}
        >
          <div className="px-4 text-white">{leftActions[0].icon}</div>
        </div>
      )}

      {/* Right actions */}
      {rightActions.length > 0 && (
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center justify-end"
          style={{
            width: Math.max(0, -swipeDistance),
            backgroundColor: rightActions[0].color,
          }}
        >
          <div className="px-4 text-white">{rightActions[0].icon}</div>
        </div>
      )}

      {/* Content */}
      <div
        style={{ transform: `translateX(${swipeDistance}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
