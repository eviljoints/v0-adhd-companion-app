// components/navigation.tsx
"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Home,
  MapPin,
  Brain,
  Users,
  Settings,
  LogOut,
  User,
  ClipboardList,
  Calendar,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"

type NavLink = { name: string; href: string; icon: React.ComponentType<{ className?: string }> }

const NAV_LINKS: NavLink[] = [
  { name: "Home", href: "/", icon: Home },
  { name: "Appointments", href: "/appointments", icon: MapPin },
  { name: "AI Coach", href: "/coach", icon: Brain },
  { name: "VIP Contacts", href: "/contacts", icon: Users },
  { name: "screening", href: "/screening", icon: ClipboardList },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "calendar", href: "/calendar-sync", icon: Calendar },
]

// Render children into <body> (avoids transforms/overflow/z-index issues)
function BodyPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single()
        setProfile(prof || null)
        void fetchBadgeCounts(user.id)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        const { data: prof } = await supabase.from("profiles").select("*").eq("id", u.id).single()
        setProfile(prof || null)
        void fetchBadgeCounts(u.id)
      } else {
        setProfile(null)
        setBadgeCounts({})
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchBadgeCounts = async (userId: string) => {
    const supabase = createClient()
    try {
      const [appointmentsRes, contactsRes] = await Promise.allSettled([
        supabase.from("appointments").select("*", { count: "exact" }).eq("user_id", userId).eq("completed", false),
        supabase.from("vip_contacts").select("*").eq("user_id", userId),
      ])
      const counts: Record<string, number> = {}

      if (appointmentsRes.status === "fulfilled" && appointmentsRes.value.count) {
        counts.Appointments = appointmentsRes.value.count
      }
      if (contactsRes.status === "fulfilled" && contactsRes.value.data) {
        const needing = contactsRes.value.data.filter((c: any) => {
          if (!c.last_contacted) return true
          const days = Math.floor((Date.now() - new Date(c.last_contacted).getTime()) / 86400000)
          return days >= (c.contact_frequency_days || 7)
        })
        if (needing.length > 0) counts["VIP Contacts"] = needing.length
      }
      setBadgeCounts(counts)
    } catch (e) {
      console.error("badgeCounts error", e)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href))

  const NavItems = () => (
    <nav className="space-y-2">
      {NAV_LINKS.map((item) => {
        const active = isActive(item.href)
        const badgeCount = badgeCounts[item.name]
        const Icon = item.icon
        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.name}
            {!!badgeCount && badgeCount > 0 && (
              <Badge variant="secondary" className="ml-auto">{badgeCount}</Badge>
            )}
          </Link>
        )
      })}
    </nav>
  )

  const UserMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profile?.avatar_url || "/placeholder.svg"} alt={profile?.full_name || user?.email} />
            <AvatarFallback>
              {profile?.full_name
                ? profile.full_name.charAt(0).toUpperCase()
                : user?.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{profile?.full_name || "User"}</p>
            <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile"><User className="mr-2 h-4 w-4" /><span>Profile</span></Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings className="mr-2 h-4 w-4" /><span>Settings</span></Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" /><span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      {/* Desktop Sidebar (md+) */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 z-40">
        <div className="flex flex-col flex-grow pt-5 bg-card border-r overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <Brain className="h-8 w-8 text-primary" />
            <span className="ml-2 text-lg font-semibold">ADHD Companion</span>
          </div>
          <div className="mt-8 flex-grow flex flex-col">
            <NavItems />
          </div>
          <div className="flex-shrink-0 p-4 border-t">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url || "/placeholder.svg"} alt={profile?.full_name || user?.email} />
                <AvatarFallback>
                  {profile?.full_name
                    ? profile.full_name.charAt(0).toUpperCase()
                    : user?.email?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.full_name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <UserMenu />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar (<md) */}
      <BodyPortal>
        <div
          data-testid="mobile-bottom-bar"
          className="fixed inset-x-0 bottom-0 z-[9999] border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 md:hidden pb-[env(safe-area-inset-bottom)] pointer-events-auto"
          role="navigation"
          aria-label="Primary mobile"
        >
          <nav className="grid grid-cols-5 h-[64px]">
            {NAV_LINKS.slice(0, 5).map((item) => {
              const active = isActive(item.href)
              const badgeCount = badgeCounts[item.name]
              const Icon = item.icon
              return (
                <Link
                  key={`bottom-${item.name}`}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center text-xs transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <div className="relative">
                    <Icon className="h-5 w-5" />
                    {!!badgeCount && badgeCount > 0 && (
                      <span className="absolute -top-1 -right-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] px-1 leading-none">
                        {badgeCount}
                      </span>
                    )}
                  </div>
                  <span className="mt-1">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </BodyPortal>
    </>
  )
}
