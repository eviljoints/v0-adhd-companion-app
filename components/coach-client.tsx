"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Brain, Sparkles, MessageCircle, Lightbulb, Heart, Send, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface Message {
  id: string
  user_id: string
  message: string
  is_user: boolean
  created_at: string
}

interface CoachContent {
  dailyMantra: string
  motivationMessage: string
  dailyTip: string
  loading: {
    mantra: boolean
    motivation: boolean
    tip: boolean
  }
}

interface CoachClientProps {
  user: User
  initialMessages: Message[]
}

export function CoachClient({ user, initialMessages }: CoachClientProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [coachContent, setCoachContent] = useState<CoachContent>({
    dailyMantra: "You are capable of amazing things, one step at a time.",
    motivationMessage: "Every small step forward is progress worth celebrating.",
    dailyTip:
      "Try the 2-minute rule: if something takes less than 2 minutes, do it now instead of adding it to your to-do list.",
    loading: {
      mantra: false,
      motivation: false,
      tip: false,
    },
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Load daily content on component mount
  useEffect(() => {
    loadDailyMantra()
    loadDailyTip()
  }, [])

  const callCoachAPI = async (type: string, context?: string) => {
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, context }),
    })

    if (!response.ok) {
      throw new Error("Failed to get coach response")
    }

    const data = await response.json()
    return data.message
  }

  const saveMessageToDatabase = async (message: string, isUser: boolean) => {
    try {
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .insert([
          {
            user_id: user.id,
            message,
            is_user: isUser,
          },
        ])
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error("Error saving message:", error)
      return null
    }
  }

  const loadDailyMantra = async () => {
    setCoachContent((prev) => ({ ...prev, loading: { ...prev.loading, mantra: true } }))
    try {
      const mantra = await callCoachAPI("daily-mantra")
      setCoachContent((prev) => ({ ...prev, dailyMantra: mantra }))
    } catch (error) {
      console.error("Failed to load daily mantra:", error)
    } finally {
      setCoachContent((prev) => ({ ...prev, loading: { ...prev.loading, mantra: false } }))
    }
  }

  const loadMotivation = async () => {
    setCoachContent((prev) => ({ ...prev, loading: { ...prev.loading, motivation: true } }))
    try {
      const motivation = await callCoachAPI("motivation")
      setCoachContent((prev) => ({ ...prev, motivationMessage: motivation }))
    } catch (error) {
      console.error("Failed to load motivation:", error)
    } finally {
      setCoachContent((prev) => ({ ...prev, loading: { ...prev.loading, motivation: false } }))
    }
  }

  const loadDailyTip = async () => {
    setCoachContent((prev) => ({ ...prev, loading: { ...prev.loading, tip: true } }))
    try {
      const tip = await callCoachAPI("tip")
      setCoachContent((prev) => ({ ...prev, dailyTip: tip }))
    } catch (error) {
      console.error("Failed to load daily tip:", error)
    } finally {
      setCoachContent((prev) => ({ ...prev, loading: { ...prev.loading, tip: false } }))
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessageText = inputMessage.trim()
    setInputMessage("")
    setIsLoading(true)

    try {
      const savedUserMessage = await saveMessageToDatabase(userMessageText, true)
      if (savedUserMessage) {
        setMessages((prev) => [...prev, savedUserMessage])
      }

      const response = await callCoachAPI("chat", userMessageText)

      const savedCoachMessage = await saveMessageToDatabase(response, false)
      if (savedCoachMessage) {
        setMessages((prev) => [...prev, savedCoachMessage])
      }
    } catch (error) {
      console.error("Failed to send message:", error)
      const errorResponse = "I'm sorry, I'm having trouble responding right now. Please try again in a moment."
      const savedErrorMessage = await saveMessageToDatabase(errorResponse, false)
      if (savedErrorMessage) {
        setMessages((prev) => [...prev, savedErrorMessage])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Your AI Coach</h1>
        <p className="text-gray-600 dark:text-gray-300">Personalized support, motivation, and tips for managing ADHD</p>
      </div>

      {/* Daily Content Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Daily Mantra */}
        <Card className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
              <Sparkles className="h-5 w-5" />
              Daily Mantra
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coachContent.loading.mantra ? (
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 text-balance">"{coachContent.dailyMantra}"</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDailyMantra}
              disabled={coachContent.loading.mantra}
              className="mt-3 text-purple-600 hover:text-purple-700"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              New Mantra
            </Button>
          </CardContent>
        </Card>

        {/* Motivation Boost */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <Heart className="h-5 w-5" />
              Motivation Boost
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coachContent.loading.motivation ? (
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 text-balance">{coachContent.motivationMessage}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMotivation}
              disabled={coachContent.loading.motivation}
              className="mt-3 text-green-600 hover:text-green-700"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Get Boost
            </Button>
          </CardContent>
        </Card>

        {/* Daily Tip */}
        <Card className="bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <Lightbulb className="h-5 w-5" />
              Daily Tip
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coachContent.loading.tip ? (
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 text-balance">{coachContent.dailyTip}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadDailyTip}
              disabled={coachContent.loading.tip}
              className="mt-3 text-orange-600 hover:text-orange-700"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              New Tip
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Chat Interface */}
      <Card className="h-[500px] flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Chat with Your Coach
          </CardTitle>
          <CardDescription>Ask questions, share your challenges, or just chat about your day</CardDescription>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0">
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-4 py-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <Brain className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Start a conversation with your AI coach!</p>
                  <p className="text-sm mt-2">
                    Try asking about ADHD strategies, motivation, or just how you're feeling today.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={cn("flex gap-3", message.is_user ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2",
                        message.is_user
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100",
                      )}
                    >
                      <p className="text-sm">{message.message}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Coach is typing...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message here..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                disabled={isLoading}
              />
              <Button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isLoading}
                size="icon"
                className="self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Press Enter to send, Shift+Enter for new line</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
