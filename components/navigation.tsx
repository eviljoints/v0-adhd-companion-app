"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
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
import { Home, MapPin, Brain, Users, Settings, Menu, Bell, LogOut, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User as SupabaseUser } from "@supabase/supabase-js"

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Appointments", href: "/appointments", icon: MapPin },
  { name: "AI Coach", href: "/coach", icon: Brain },
  { name: "VIP Contacts", href: "/contacts", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single()
          .then(({ data }) => setProfile(data))

        fetchBadgeCounts(user.id)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => setProfile(data))

        fetchBadgeCounts(session.user.id)
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
      const [appointmentsResult, contactsResult] = await Promise.allSettled([
        supabase.from("appointments").select("*", { count: "exact" }).eq("user_id", userId).eq("completed", false),
        supabase.from("vip_contacts").select("*").eq("user_id", userId),
      ])

      const newBadgeCounts: Record<string, number> = {}

      if (appointmentsResult.status === "fulfilled" && appointmentsResult.value.count) {
        newBadgeCounts.Appointments = appointmentsResult.value.count
      }

      if (contactsResult.status === "fulfilled" && contactsResult.value.data) {
        const contactsNeedingAttention = contactsResult.value.data.filter((contact: any) => {
          if (!contact.last_contacted) return true
          const daysSinceContact = Math.floor(
            (Date.now() - new Date(contact.last_contacted).getTime()) / (1000 * 60 * 60 * 24),
          )
          return daysSinceContact >= (contact.contact_frequency_days || 7)
        })

        if (contactsNeedingAttention.length > 0) {
          newBadgeCounts["VIP Contacts"] = contactsNeedingAttention.length
        }
      }

      setBadgeCounts(newBadgeCounts)
    } catch (error) {
      console.error("Error fetching badge counts:", error)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const NavItems = ({ mobile = false }) => (
    <nav className={cn("space-y-2", mobile && "px-4")}>
      {navigation.map((item) => {
        const isActive = pathname === item.href
        const badgeCount = badgeCounts[item.name]

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={() => mobile && setIsOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.name}
            {badgeCount && badgeCount > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {badgeCount}
              </Badge>
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
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase()}
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
          <Link href="/profile">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (!user) {
    return (
      <div className="md:hidden">
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center">
            <Brain className="h-6 w-6 text-primary" />
            <span className="ml-2 font-semibold">ADHD Companion</span>
          </div>
          <Button asChild>
            <Link href="/auth/login">Sign In</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
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

      {/* Mobile Header */}
      <div className="md:hidden">
        <div className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center">
            <Brain className="h-6 w-6 text-primary" />
            <span className="ml-2 font-semibold">ADHD Companion</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <UserMenu />
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <div className="flex items-center mb-8">
                  <Brain className="h-6 w-6 text-primary" />
                  <span className="ml-2 font-semibold">ADHD Companion</span>
                </div>
                <NavItems mobile />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </>
  )
}
