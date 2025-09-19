"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, Brain, Users, Plus, ImageIcon, LogOut } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  PullToRefresh,
  FloatingActionButton,
  ConnectionStatus,
  InstallPrompt,
  TouchCard,
  useMobileCapabilities,
} from "@/components/mobile-optimizations"

interface DashboardClientProps {
  user: any
  profile: any
  stats: {
    activeReminders: number
    vipContactsCount: number
    streakDays: number
    completedToday: number
  }
  recentAppointments: any[]
  contactsNeedingAttention: any[]
}

const mantras = [
  "You are capable of amazing things, one step at a time.",
  "Progress, not perfection, is what matters today.",
  "Your unique brain is your superpower.",
  "Small steps lead to big achievements.",
  "You've overcome challenges before, you can do it again.",
  "Focus on what you can control right now.",
  "Every completed task is a victory worth celebrating.",
]

export function DashboardClient({
  user,
  profile,
  stats,
  recentAppointments,
  contactsNeedingAttention,
}: DashboardClientProps) {
  const [todayMantra] = useState(() => {
    const today = new Date().toDateString()
    const userSeed = user.id.slice(-4)
    const index = (today.length + Number.parseInt(userSeed, 16)) % mantras.length
    return mantras[index]
  })

  const { isTouchDevice } = useMobileCapabilities()
  const router = useRouter()
  const supabase = createClient()

  const handleRefresh = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    router.refresh()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const CardComponent = isTouchDevice ? TouchCard : Card

  return (
    <>
      <ConnectionStatus />
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-indigo-900">
          <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex justify-between items-start mb-4">
                <div></div>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 text-balance">
                Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 text-pretty">
                Stay organized, motivated, and connected with location-based reminders and AI support
              </p>
            </div>

            {/* Daily Mantra Card */}
            <CardComponent className="mb-8 bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Brain className="h-6 w-6" />
                  Today's Mantra
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center text-lg font-medium text-balance">"{todayMantra}"</p>
              </CardContent>
            </CardComponent>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <CardComponent className="text-center">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-blue-600">{stats.activeReminders}</div>
                  <div className="text-sm text-gray-600">Active Reminders</div>
                </CardContent>
              </CardComponent>
              <CardComponent className="text-center">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">{stats.vipContactsCount}</div>
                  <div className="text-sm text-gray-600">VIP Contacts</div>
                </CardContent>
              </CardComponent>
              <CardComponent className="text-center">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-purple-600">{stats.streakDays}</div>
                  <div className="text-sm text-gray-600">Days Streak</div>
                </CardContent>
              </CardComponent>
              <CardComponent className="text-center">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-orange-600">{stats.completedToday}</div>
                  <div className="text-sm text-gray-600">Completed Today</div>
                </CardContent>
              </CardComponent>
            </div>

            {/* Main Features Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Location Reminders */}
              <CardComponent className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-600" />
                    Location Reminders
                  </CardTitle>
                  <CardDescription>Set geo-tagged appointments that remind you when you're nearby</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {recentAppointments.length > 0 ? (
                      recentAppointments.slice(0, 2).map((appointment) => (
                        <div key={appointment.id} className="flex items-center justify-between">
                          <span className="text-sm truncate">{appointment.title || appointment.location_name}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant={appointment.completed ? "default" : "secondary"}>
                              {appointment.completed ? "Done" : "Active"}
                            </Badge>
                            {appointment.image_url && <ImageIcon className="h-3 w-3 text-gray-400" />}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">No reminders yet</p>
                    )}
                  </div>
                  <Link href="/appointments">
                    <Button className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Reminder
                    </Button>
                  </Link>
                </CardContent>
              </CardComponent>

              {/* AI Coach */}
              <CardComponent className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-600" />
                    AI Coach
                  </CardTitle>
                  <CardDescription>Get personalized motivation and helpful tips throughout your day</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">"Ready to tackle your goals today? I'm here to help!"</p>
                    <Badge variant="outline">Personal Assistant</Badge>
                  </div>
                  <Link href="/coach">
                    <Button className="w-full bg-transparent" variant="outline">
                      Chat with Coach
                    </Button>
                  </Link>
                </CardContent>
              </CardComponent>

              {/* VIP Contacts */}
              <CardComponent className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-green-600" />
                    VIP Contacts
                  </CardTitle>
                  <CardDescription>Important people to stay connected with regularly</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {contactsNeedingAttention.length > 0 ? (
                      contactsNeedingAttention.map((contact) => {
                        const daysSince = contact.last_contacted
                          ? Math.floor(
                              (Date.now() - new Date(contact.last_contacted).getTime()) / (1000 * 60 * 60 * 24),
                            )
                          : null
                        return (
                          <div key={contact.id} className="flex items-center justify-between">
                            <span className="text-sm truncate">{contact.name}</span>
                            <Badge variant="secondary">{daysSince ? `${daysSince} days ago` : "Never contacted"}</Badge>
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-sm text-gray-500">All contacts up to date!</p>
                    )}
                  </div>
                  <Link href="/contacts">
                    <Button className="w-full bg-transparent" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Manage Contacts
                    </Button>
                  </Link>
                </CardContent>
              </CardComponent>
            </div>

            {/* Recent Activity */}
            <CardComponent>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your latest accomplishments and reminders</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentAppointments.length > 0 ? (
                    recentAppointments.map((appointment) => (
                      <div key={appointment.id} className="flex items-center gap-3">
                        <div
                          className={`h-2 w-2 rounded-full ${appointment.completed ? "bg-green-500" : "bg-blue-500"}`}
                        ></div>
                        <span className="text-sm">
                          {appointment.completed ? "Completed: " : "Created: "}
                          {appointment.title || appointment.location_name}
                        </span>
                        <Badge variant="secondary">{new Date(appointment.updated_at).toLocaleDateString()}</Badge>
                        {appointment.image_url && <ImageIcon className="h-3 w-3 text-gray-400" />}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No recent activity. Start by adding a reminder!</p>
                  )}
                </div>
              </CardContent>
            </CardComponent>

            {/* Mobile spacing for FAB */}
            <div className="h-20 md:hidden" />
          </div>
        </div>
      </PullToRefresh>

      {/* Mobile FAB */}
      <div className="md:hidden">
        <FloatingActionButton
          onClick={() => (window.location.href = "/appointments")}
          icon={<Plus className="h-6 w-6" />}
          label="Add Reminder"
        />
      </div>

      <InstallPrompt />
    </>
  )
}
