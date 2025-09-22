// app/page.tsx
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardClient } from "@/components/dashboard-client"

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const [{ data: appointments }, { data: contacts }, { data: userStats }, { data: profile }] = await Promise.all([
    supabase.from("appointments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("vip_contacts").select("*").eq("user_id", user.id).order("last_contacted", { ascending: true }),
    supabase.from("user_stats").select("*").eq("user_id", user.id).single(),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ])

  const activeReminders = appointments?.filter((apt) => !apt.completed).length || 0
  const vipContactsCount = contacts?.length || 0
  const streakDays = userStats?.streak_days || 0
  const completedToday =
    appointments?.filter(
      (apt) => apt.completed && new Date(apt.updated_at).toDateString() === new Date().toDateString(),
    ).length || 0

  const recentAppointments = appointments?.slice(0, 3) || []

  const contactsNeedingAttention =
    contacts
      ?.filter((contact) => {
        if (!contact.last_contacted) return true
        const daysSinceContact = Math.floor(
          (Date.now() - new Date(contact.last_contacted).getTime()) / (1000 * 60 * 60 * 24),
        )
        return daysSinceContact >= (contact.contact_frequency_days || 7)
      })
      .slice(0, 2) || []

  return (
    <div className="md:pl-64 w-full overflow-x-hidden pb-[calc(64px+env(safe-area-inset-bottom))]">
      <div className="p-6">
        <DashboardClient
          user={user}
          profile={profile}
          stats={{
            activeReminders: { label: "Active Reminders", value: activeReminders, href: "/appointments" },
            vipContactsCount: { label: "VIP Contacts", value: vipContactsCount, href: "/contacts" },
            streakDays: { label: "Streak Days", value: streakDays },
            completedToday: { label: "Completed Today", value: completedToday },
          }}
          recentAppointments={recentAppointments}
          contactsNeedingAttention={contactsNeedingAttention}
        />
      </div>
    </div>
  )
}
