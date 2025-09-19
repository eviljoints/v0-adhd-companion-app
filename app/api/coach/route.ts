// app/api/coach/route.ts
import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { type, context = "", history = [] } = body as {
      type: "daily-mantra" | "motivation" | "tip" | "chat"
      context?: string // for "chat" this is the user's message
      history?: Array<{ role: "user" | "assistant"; content: string }>
    }

    if (!type) {
      return Response.json({ error: "Invalid request type" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [
      appointmentsResult,
      contactsResult,
      userStatsResult,
      profileResult,
      recentMessagesResult,
    ] = await Promise.allSettled([
      supabase
        .from("appointments")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("vip_contacts").select("*").eq("user_id", user.id).limit(3),
      supabase.from("user_stats").select("*").eq("user_id", user.id).single(),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("ai_chat_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ])

    const appointments =
      appointmentsResult.status === "fulfilled" ? appointmentsResult.value.data || [] : []
    const contacts = contactsResult.status === "fulfilled" ? contactsResult.value.data || [] : []
    const userStats =
      userStatsResult.status === "fulfilled" ? userStatsResult.value.data : null
    const profile = profileResult.status === "fulfilled" ? profileResult.value.data : null
    const recentMessages =
      recentMessagesResult.status === "fulfilled" ? recentMessagesResult.value.data || [] : []

    const personalContext = buildPersonalContext({
      appointments,
      contacts,
      userStats,
      profile,
      recentMessages,
    })

    // Fold recent chat history (last ~6 turns) into a compact bullet list for variety/continuity
    const recentChatBullets =
      Array.isArray(history) && history.length
        ? "\nRecent chat:\n" +
          history
            .slice(-6)
            .map((m) => `- ${m.role === "user" ? "User" : "Coach"}: ${m.content}`)
            .join("\n")
        : ""

    let prompt = ""

    switch (type) {
      case "daily-mantra":
        prompt = `Generate a short, encouraging daily mantra specifically for someone with ADHD.
The mantra should be:
- Positive and empowering
- 1–2 sentences max
- Emphasize ADHD strengths (creativity, hyperfocus, resilience)
- Avoid toxic positivity

${personalContext ? `Personal context: ${personalContext}` : ""}

Return only the mantra text, no quotes or extra formatting.`
        break

      case "motivation":
        prompt = `Provide a brief, encouraging message for someone with ADHD who might be struggling with motivation today.
The message should be:
- Empathetic and validating
- Practical and actionable
- 2–3 sentences max
- Focus on small wins and progress

${personalContext ? `Personal context: ${personalContext}` : ""}
User context: ${context || "General motivation needed"}

Return only the motivational message, no quotes or extra formatting.`
        break

      case "tip":
        prompt = `Share a practical, evidence-informed tip for managing ADHD symptoms in daily life.
The tip should be:
- Actionable and specific
- Easy to implement
- 2–3 sentences max
- Focus on executive function, organization, or focus strategies

${personalContext ? `Personal context: ${personalContext}` : ""}
Context: ${context || "General ADHD management"}

Return only the tip, no quotes or extra formatting.`
        break

      case "chat":
        prompt = `You are an empathetic AI coach for people with ADHD.
You understand ADHD challenges like executive dysfunction, rejection sensitivity, hyperfocus, and emotional regulation.

${personalContext ? `Personal context about this user: ${personalContext}` : ""}${recentChatBullets}

Respond to the user's message with:
- Empathy and understanding
- Practical, ADHD-specific advice when appropriate
- Validation without toxic positivity
- Conversational, supportive tone
- Reference their personal context when relevant (appointments, contacts, progress)
- Keep it concise (2–6 short sentences)

User message: ${context}

Respond as their supportive ADHD coach:`
        break

      default:
        return Response.json({ error: "Invalid request type" }, { status: 400 })
    }

    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        prompt,
        maxTokens: 220,
        // Make it less repetitive / more varied:
        temperature: 0.9,
        topP: 0.95,
        presencePenalty: 0.6,
        frequencyPenalty: 0.5,
      })

      return Response.json({ message: text.trim() }, { headers: { "Cache-Control": "no-store" } })
    } catch (aiError) {
      console.error("AI generation error:", aiError)
      const fallbackResponses = {
        "daily-mantra":
          "Your ADHD brain is unique and powerful. Today, take one clear step and trust your momentum.",
        motivation:
          "It’s okay if today feels heavy. Pick one tiny task, finish it, and let that win carry you forward.",
        tip: "Try a 5-minute warmup timer: start a task for just five minutes. When it rings, decide to stop or continue—both are wins.",
        chat:
          "I hear you. Your feelings are valid, and small, doable steps are enough right now. Let’s pick one next action you can actually finish.",
      }
      return Response.json({
        message: fallbackResponses[type as keyof typeof fallbackResponses] ?? fallbackResponses.chat,
      })
    }
  } catch (error) {
    console.error("AI Coach error:", error)
    return Response.json({ error: "Failed to generate response" }, { status: 500 })
  }
}

function buildPersonalContext({
  appointments,
  contacts,
  userStats,
  profile,
  recentMessages,
}: {
  appointments: any[]
  contacts: any[]
  userStats: any
  profile: any
  recentMessages: any[]
}) {
  const contextParts: string[] = []

  if (profile?.full_name) {
    contextParts.push(`User's name is ${profile.full_name.split(" ")[0]}`)
  }

  if (userStats?.streak_days > 0) {
    contextParts.push(`Currently on a ${userStats.streak_days}-day streak`)
  }

  const activeAppointments = (appointments || []).filter((apt: any) => !apt.completed)
  const completedToday = (appointments || []).filter(
    (apt: any) => apt.completed && new Date(apt.updated_at).toDateString() === new Date().toDateString(),
  )

  if (activeAppointments.length > 0) {
    contextParts.push(`Has ${activeAppointments.length} active location reminders`)
  }
  if (completedToday.length > 0) {
    contextParts.push(`Completed ${completedToday.length} tasks today`)
  }

  const contactsNeedingAttention = (contacts || []).filter((contact: any) => {
    if (!contact.last_contacted) return true
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(contact.last_contacted).getTime()) / (1000 * 60 * 60 * 24),
    )
    return daysSinceContact >= (contact.contact_frequency_days || 7)
  })
  if (contactsNeedingAttention.length > 0) {
    contextParts.push(`Has ${contactsNeedingAttention.length} contacts that need reaching out to`)
  }

  const userMessages = (recentMessages || []).filter((msg: any) => msg.is_user).slice(0, 3)
  if (userMessages.length > 0) {
    const recentTopics = userMessages.map((msg: any) => String(msg.message || "").toLowerCase())
    if (recentTopics.some((t) => t.includes("stress") || t.includes("overwhelm"))) {
      contextParts.push("Has mentioned feeling stressed or overwhelmed recently")
    }
    if (recentTopics.some((t) => t.includes("focus") || t.includes("concentrate"))) {
      contextParts.push("Has been discussing focus and concentration challenges")
    }
  }

  return contextParts.length > 0 ? contextParts.join(". ") + "." : null
}
