"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

/** -------------------- Constants & Types -------------------- */

type ADHDAnswer = "Never" | "Rarely" | "Sometimes" | "Often" | "Very Often"
type AQAnswer = "Definitely Agree" | "Slightly Agree" | "Slightly Disagree" | "Definitely Disagree"

const ADHD_SCALE: ADHDAnswer[] = ["Never","Rarely","Sometimes","Often","Very Often"]
const AQ_SCALE: AQAnswer[] = ["Definitely Agree","Slightly Agree","Slightly Disagree","Definitely Disagree"]

// ASRS v1.1 Screener (Part A, 6 items)
const ASRS_A_ITEMS = [
  "How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?",
  "How often do you have difficulty getting things in order when you have to do a task that requires organization?",
  "How often do you have problems remembering appointments or obligations?",
  "When you have a task that requires a lot of thought, how often do you avoid or delay getting started?",
  "How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?",
  "How often do you feel overly active and compelled to do things, like you were driven by a motor?",
]

// Full 18 items (optional Part B, 7–18). Keep it compact but complete.
const ASRS_B_ITEMS = [
  "How often do you make careless mistakes when you have to work on a boring or difficult project?",
  "How often do you have difficulty keeping your attention when you are doing boring or repetitive work?",
  "How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?",
  "How often do you misplace or have difficulty finding things at home or at work?",
  "How often are you distracted by activity or noise around you?",
  "How often do you leave your seat in meetings or in other situations in which you are expected to stay seated?",
  "How often do you feel restless or fidgety?",
  "How often do you have difficulty unwinding and relaxing when you have time to yourself?",
  "How often do you find yourself talking too much when you are in social situations?",
  "When you're in a conversation, how often do you find yourself finishing the sentences of the people you are talking to, before they can finish it themselves?",
  "How often do you have difficulty waiting your turn in situations when turn-taking is required?",
  "How often do you interrupt others when they are busy?",
]

// AQ-10 (adult quick screen)
const AQ10_ITEMS = [
  { text: "I often notice small sounds when others do not.", keyAgree = true },
  { text: "I usually concentrate more on the whole picture, rather than the small details.", keyAgree = false }, // reverse
  { text: "I find it easy to do more than one thing at once.", keyAgree = false }, // reverse
  { text: "If there is an interruption, I can switch back to what I was doing very quickly.", keyAgree = false }, // reverse
  { text: "I find it easy to ‘read between the lines’ when someone is talking to me.", keyAgree = false }, // reverse
  { text: "I know how to tell if someone listening to me is getting bored.", keyAgree = false }, // reverse
  { text: "When I’m reading a story I find it difficult to work out the characters’ intentions.", keyAgree = true },
  { text: "I like to collect information about categories of things (e.g., types of cars, birds, trains, plants).", keyAgree = true },
  { text: "I find it easy to work out what someone is thinking or feeling just by looking at their face.", keyAgree = false }, // reverse
  { text: "I find it difficult to work out people’s intentions.", keyAgree = true },
] as const

type AQ10Item = typeof AQ10_ITEMS[number]

/** -------------------- Scoring Helpers -------------------- */

// ASRS Part A positive screen rule:
// Q1-3, Q5-6 are positive if answer ∈ {Sometimes, Often, Very Often}
// Q4 is positive if answer ∈ {Often, Very Often}
function scoreASRSPartA(answers: ADHDAnswer[]) {
  let positives = 0
  answers.forEach((ans, idx) => {
    if (idx === 3) {
      if (ans === "Often" || ans === "Very Often") positives++
    } else {
      if (ans === "Sometimes" || ans === "Often" || ans === "Very Often") positives++
    }
  })
  return {
    positiveCount: positives,
    isPositiveScreen: positives >= 4,
  }
}

// Optional “broad signal” across all 18 to show trend (NOT diagnostic)
function scoreASRSBroad(all18: ADHDAnswer[]) {
  const map = { "Never": 0, "Rarely": 1, "Sometimes": 2, "Often": 3, "Very Often": 4 } as const
  const total = all18.reduce((s, a) => s + map[a], 0)
  const max = 18 * 4
  const pct = Math.round((total / max) * 100)
  return { total, pct }
}

// AQ-10 scoring: 1 point if response matches “key” direction
function scoreAQ10(answers: AQAnswer[]) {
  const toAgree = (a: AQAnswer) => a === "Definitely Agree" || a === "Slightly Agree"
  const toDisagree = (a: AQAnswer) => a === "Definitely Disagree" || a === "Slightly Disagree"
  let score = 0
  answers.forEach((a, i) => {
    const keyedAgree = AQ10_ITEMS[i].keyAgree
    if ((keyedAgree && toAgree(a)) || (!keyedAgree && toDisagree(a))) score++
  })
  return {
    score, // 0..10
    thresholdReached: score >= 6, // commonly used cut-off
  }
}

/** -------------------- Page -------------------- */

export default function ScreeningPage() {
  const [tool, setTool] = useState<"adhd" | "autism">("adhd")
  const [showPartB, setShowPartB] = useState(false)

  const [asrsA, setAsrsA] = useState<ADHDAnswer[]>(Array(6).fill("Never"))
  const [asrsB, setAsrsB] = useState<ADHDAnswer[]>(Array(12).fill("Never"))

  const [aq10, setAq10] = useState<AQAnswer[]>(Array(10).fill("Definitely Disagree"))

  const [email, setEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [serverMsg, setServerMsg] = useState<string | null>(null)

  const asrsSummary = useMemo(() => {
    const a = scoreASRSPartA(asrsA)
    const broad = scoreASRSBroad([...asrsA, ...asrsB])
    return { ...a, broad }
  }, [asrsA, asrsB])

  const aqSummary = useMemo(() => scoreAQ10(aq10), [aq10])

  async function handleEmailResults() {
    setServerMsg(null)
    setSubmitting(true)
    try {
      const payload =
        tool === "adhd"
          ? {
              tool: "ASRS-v1.1",
              email,
              answers: {
                partA: asrsA,
                partB: showPartB ? asrsB : undefined,
              },
              scores: {
                partA_positiveCount: asrsSummary.positiveCount,
                partA_positiveScreen: asrsSummary.isPositiveScreen,
                broad_total: asrsSummary.broad.total,
                broad_pct: asrsSummary.broad.pct,
              },
              interpretation: asrsSummary.isPositiveScreen
                ? "Your Part A result meets the commonly used threshold for a positive ADHD screen. This is not a diagnosis—consider speaking with a clinician."
                : "Your Part A result does not meet the common positive screen threshold. If you still have concerns, consider talking with a clinician.",
            }
          : {
              tool: "AQ-10",
              email,
              answers: aq10,
              scores: {
                aq10_score: aqSummary.score,
                aq10_thresholdReached: aqSummary.thresholdReached,
              },
              interpretation: aqSummary.thresholdReached
                ? "Your AQ-10 score meets a common threshold suggesting further assessment for autistic traits may be helpful. This is not a diagnosis."
                : "Your AQ-10 score is below the common threshold. If you still have concerns, consider a conversation with a clinician.",
            }

      const res = await fetch("/api/screening/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed to submit")
      setServerMsg(j.message || "Saved and (if enabled) emailed.")
    } catch (e: any) {
      setServerMsg(e.message || "Something went wrong.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="md:pl-64">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header + Disclaimer */}
        <Card className="border-amber-300">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold">Self-Reflection Screeners</h1>
            <p className="text-sm text-muted-foreground mt-2">
              These questions are for information only and <strong>not</strong> a diagnosis. Results can help you decide
              whether to speak with a qualified healthcare professional.
            </p>
            <p className="text-xs mt-2">
              If you are in crisis or feel unsafe, please seek urgent help in your region.
            </p>
          </CardContent>
        </Card>

        {/* Tool switcher */}
        <Tabs value={tool} onValueChange={(v) => setTool(v as any)}>
          <TabsList>
            <TabsTrigger value="adhd">ADHD (ASRS-v1.1)</TabsTrigger>
            <TabsTrigger value="autism">Autism (AQ-10)</TabsTrigger>
          </TabsList>

          {/* ADHD */}
          <TabsContent value="adhd" className="space-y-5">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">ASRS v1.1 – Part A (6 questions)</h2>
                  <Badge variant={asrsSummary.isPositiveScreen ? "destructive" : "secondary"}>
                    {asrsSummary.isPositiveScreen
                      ? `Positive screen (${asrsSummary.positiveCount}/6)`
                      : `Screen: ${asrsSummary.positiveCount}/6`}
                  </Badge>
                </div>

                {ASRS_A_ITEMS.map((q, i) => (
                  <div key={i} className="space-y-2">
                    <Label className="text-sm">{i + 1}. {q}</Label>
                    <Select
                      value={asrsA[i]}
                      onValueChange={(v) => {
                        const next = [...asrsA]
                        next[i] = v as ADHDAnswer
                        setAsrsA(next)
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Pick an option" /></SelectTrigger>
                      <SelectContent>
                        {ADHD_SCALE.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted-foreground">
                    A result of <strong>4 or more</strong> flagged answers in Part A is a commonly used positive screen.
                  </div>
                  <Button
                    variant="ghost"
                    className={cn("bg-transparent", showPartB && "text-primary")}
                    onClick={() => setShowPartB((s) => !s)}
                  >
                    {showPartB ? "Hide" : "Add"} Part B (optional)
                  </Button>
                </div>
              </CardContent>
            </Card>

            {showPartB && (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <h3 className="font-semibold">ASRS – Additional Items (7–18)</h3>
                  {ASRS_B_ITEMS.map((q, i) => (
                    <div key={i} className="space-y-2">
                      <Label className="text-sm">{i + 7}. {q}</Label>
                      <Select
                        value={asrsB[i]}
                        onValueChange={(v) => {
                          const next = [...asrsB]
                          next[i] = v as ADHDAnswer
                          setAsrsB(next)
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Pick an option" /></SelectTrigger>
                        <SelectContent>
                          {ADHD_SCALE.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground">
                    Broad severity (informal): {asrsSummary.broad.total} / 72 ({asrsSummary.broad.pct}%)
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Autism */}
          <TabsContent value="autism" className="space-y-5">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">AQ-10 (Adult Quick Screen)</h2>
                  <Badge variant={aqSummary.thresholdReached ? "destructive" : "secondary"}>
                    Score: {aqSummary.score}/10 {aqSummary.thresholdReached ? "(≥6 suggests further assessment)" : ""}
                  </Badge>
                </div>

                {AQ10_ITEMS.map((it, i) => (
                  <div key={i} className="space-y-2">
                    <Label className="text-sm">{i + 1}. {it.text}</Label>
                    <Select
                      value={aq10[i]}
                      onValueChange={(v) => {
                        const next = [...aq10]
                        next[i] = v as AQAnswer
                        setAq10(next)
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Pick an option" /></SelectTrigger>
                      <SelectContent>
                        {AQ_SCALE.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                <div className="text-xs text-muted-foreground">
                  A score of <strong>6 or more</strong> is often used to suggest discussing an assessment for autistic traits.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Email capture + send */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold">Email me my results</h3>
            <p className="text-sm text-muted-foreground">
              We’ll include your selected answers, the calculated score, and a friendly reminder that this is not a diagnosis.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                disabled={!email || submitting}
                onClick={handleEmailResults}
              >
                {submitting ? "Sending…" : "Send results"}
              </Button>
            </div>
            {serverMsg && <p className="text-sm">{serverMsg}</p>}
          </CardContent>
        </Card>

        {/* Footer reminder */}
        <p className="text-xs text-muted-foreground">
          These tools are for informational purposes only and cannot diagnose any condition. If these results resonate,
          consider contacting your GP or a licensed clinician for a full assessment.
        </p>
      </div>
    </div>
  )
}
