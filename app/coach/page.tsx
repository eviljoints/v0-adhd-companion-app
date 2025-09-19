import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { CoachClient } from "@/components/coach-client"

export default async function CoachPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: chatMessages } = await supabase
    .from("ai_chat_messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  return <CoachClient user={user} initialMessages={chatMessages || []} />
}
