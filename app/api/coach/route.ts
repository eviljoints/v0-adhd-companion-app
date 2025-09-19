import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  try {
    const { type, context } = await req.json()
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [appointmentsResult, contactsResult, userStatsResult, profileResult, recentMessagesResult] =
      await Promise.allSettled([
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

    const appointments = appointmentsResult.status === "fulfilled" ? appointmentsResult.value.data || [] : []
    const contacts = contactsResult.status === "fulfilled" ? contactsResult.value.data || [] : []
    const userStats = userStatsResult.status === "fulfilled" ? userStatsResult.value.data : null
    const profile = profileResult.status === "fulfilled" ? profileResult.value.data : null
    const recentMessages = recentMessagesResult.status === "fulfilled" ? recentMessagesResult.value.data || [] : []

    const personalContext = buildPersonalContext({
      appointments,
      contacts,
      userStats,
      profile,
      recentMessages,
    })

    let prompt = ""

    switch (type) {
      case "daily-mantra":
        prompt = `Generate a short, encouraging daily mantra specifically for someone with ADHD. 
        The mantra should be:
        - Positive and empowering
        - 1-2 sentences maximum
        - Focused on ADHD strengths like creativity, hyperfocus, and resilience
        - Avoid toxic positivity
        - Be authentic and understanding of ADHD challenges
        
        ${personalContext ? `Personal context: ${personalContext}` : ""}
        
        Return only the mantra text, no quotes or extra formatting.`
        break

      case "motivation":
        prompt = `Provide a brief, encouraging message for someone with ADHD who might be struggling with motivation today.
        The message should be:
        - Understanding and empathetic
        - Practical and actionable
        - 2-3 sentences maximum
        - Acknowledge that some days are harder than others
        - Focus on small wins and progress
        
        ${personalContext ? `Personal context: ${personalContext}` : ""}
        User context: ${context || "General motivation needed"}
        
        Return only the motivational message, no quotes or extra formatting.`
        break

      case "tip":
        prompt = `Share a practical, evidence-based tip for managing ADHD symptoms in daily life.
        The tip should be:
        - Actionable and specific
        - Based on ADHD research and best practices
        - Easy to implement
        - 2-3 sentences maximum
        - Focus on executive function, organization, or focus strategies
        
        ${personalContext ? `Personal context: ${personalContext}` : ""}
        Context: ${context || "General ADHD management"}
        
        Return only the tip, no quotes or extra formatting.`
        break

      case "chat":
        prompt = `You are an empathetic AI coach specifically designed to help people with ADHD. 
        You understand the unique challenges of ADHD including executive dysfunction, rejection sensitivity, 
        hyperfocus, and emotional regulation difficulties.
        
        ${personalContext ? `Personal context about this user: ${personalContext}` : ""}
        
        Respond to the user's message with:
        - Empathy and understanding
        - Practical, ADHD-specific advice when appropriate
        - Validation of their experiences
        - Encouragement without toxic positivity
        - Keep responses conversational and supportive
        - Reference their personal context when relevant (appointments, contacts, progress)
        
        User message: ${context}
        
        Respond as their supportive ADHD coach:`
        break

      default:
        throw new Error("Invalid request type")
    }

    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        prompt,
        maxTokens: 200,
        temperature: 0.7,
      })

      return Response.json({ message: text.trim() })
    } catch (aiError) {
      console.error("AI generation error:", aiError)

      const fallbackResponses = {
        "daily-mantra":
          "Your ADHD brain is unique and powerful. Today, embrace your creativity and take things one step at a time.",
        motivation:
          "It's okay if today feels challenging. Every small step forward is progress, and you're doing better than you think.",
        tip: "Try the 2-minute rule: if something takes less than 2 minutes, do it now instead of adding it to your to-do list.",
        chat: "I understand you're reaching out, and I want you to know that your feelings are valid. While I'm having trouble generating a personalized response right now, remember that you're not alone in this journey.",
      }

      return Response.json({
        message: fallbackResponses[type as keyof typeof fallbackResponses] || fallbackResponses.chat,
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
  const contextParts = []

  // User name and basic info
  if (profile?.full_name) {
    contextParts.push(`User's name is ${profile.full_name.split(" ")[0]}`)
  }

  // Current streak and progress
  if (userStats?.streak_days > 0) {
    contextParts.push(`Currently on a ${userStats.streak_days}-day streak`)
  }

  // Recent appointments/reminders
  const activeAppointments = appointments.filter((apt) => !apt.completed)
  const completedToday = appointments.filter(
    (apt) => apt.completed && new Date(apt.updated_at).toDateString() === new Date().toDateString(),
  )

  if (activeAppointments.length > 0) {
    contextParts.push(`Has ${activeAppointments.length} active location reminders`)
  }

  if (completedToday.length > 0) {
    contextParts.push(`Completed ${completedToday.length} tasks today`)
  }

  // VIP contacts that need attention
  const contactsNeedingAttention = contacts.filter((contact) => {
    if (!contact.last_contacted) return true
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(contact.last_contacted).getTime()) / (1000 * 60 * 60 * 24),
    )
    return daysSinceContact >= (contact.contact_frequency_days || 7)
  })

  if (contactsNeedingAttention.length > 0) {
    contextParts.push(`Has ${contactsNeedingAttention.length} contacts that need reaching out to`)
  }

  // Recent conversation themes (last few messages)
  const userMessages = recentMessages.filter((msg) => msg.is_user).slice(0, 3)
  if (userMessages.length > 0) {
    const recentTopics = userMessages.map((msg) => msg.message.toLowerCase())
    if (recentTopics.some((topic) => topic.includes("stress") || topic.includes("overwhelm"))) {
      contextParts.push("Has mentioned feeling stressed or overwhelmed recently")
    }
    if (recentTopics.some((topic) => topic.includes("focus") || topic.includes("concentrate"))) {
      contextParts.push("Has been discussing focus and concentration challenges")
    }
  }

  return contextParts.length > 0 ? contextParts.join(". ") + "." : null
}
