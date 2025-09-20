"use client"

import { useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

/** -------------------- Constants & Types -------------------- */

type ADHDAnswer = "Never" | "Rarely" | "Sometimes" | "Often" | "Very Often"
type AQAnswer = "Strongly Disagree" | "Slightly Disagree" | "Slightly Agree" | "Strongly Agree"

// UI labels for the sliders
const ADHD_UI_LABELS = ["Never", "Rarely", "Sometimes", "Often", "Constantly"] as const
// Standard scoring labels (we map Constantly -> Very Often)
const ADHD_SCORE_LABELS: ADHDAnswer[] = ["Never", "Rarely", "Sometimes", "Often", "Very Often"]
const AQ_LABELS: AQAnswer[] = ["Strongly Disagree", "Slightly Disagree", "Slightly Agree", "Strongly Agree"]

// ASRS v1.1 Screener (Part A, 6 items)
const ASRS_A_ITEMS = [
  "How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?",
  "How often do you have difficulty getting things in order when you have to do a task that requires organization?",
  "How often do you have problems remembering appointments or obligations?",
  "When you have a task that requires a lot of thought, how often do you avoid or delay getting started?",
  "How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?",
  "How often do you feel overly active and compelled to do things, like you were driven by a motor?",
]

// Full 18 items (optional Part B, 7–18)
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
  { text: "I often notice small sounds when others do not.", keyAgree: true },
  { text: "I usually concentrate more on the whole picture, rather than the small details.", keyAgree: false }, // reverse
  { text: "I find it easy to do more than one thing at once.", keyAgree: false }, // reverse
  { text: "If there is an interruption, I can switch back to what I was doing very quickly.", keyAgree: false }, // reverse
  { text: "I find it easy to ‘read between the lines’ when someone is talking to me.", keyAgree: false }, // reverse
  { text: "I know how to tell if someone listening to me is getting bored.", keyAgree: false }, // reverse
  { text: "When I’m reading a story I find it difficult to work out the characters’ intentions.", keyAgree: true },
  { text: "I like to collect information about categories of things (e.g., types of cars, birds, trains, plants).", keyAgree: true },
  { text: "I find it easy to work out what someone is thinking or feeling just by looking at their face.", keyAgree: false }, // reverse
  { text: "I find it difficult to work out people’s intentions.", keyAgree: true },
] as const

/** -------------------- Helpers -------------------- */

// map ADHD slider index (0..4) to scoring text
const idxToAdhdScoreLabel = (idx: number): ADHDAnswer =>
  ADHD_SCORE_LABELS[Math.max(0, Math.min(4, idx))]
// map AQ slider index (0..3) to text
const idxToAQLabel = (idx: number): AQAnswer =>
  AQ_LABELS[Math.max(0, Math.min(3, idx))]

/** -------------------- Scoring -------------------- */

// ASRS Part A positive screen rule based on indices (0..4):
// Q1-3,5-6 => positive if index >= 2 (Sometimes+)
// Q4       => positive if index >= 3 (Often+)
function scoreASRSPartAFromIdx(indices: number[]) {
  let positives = 0
  indices.forEach((val, idx) => {
    if (idx === 3) {
      if (val >= 3) positives++
    } else {
      if (val >= 2) positives++
    }
  })
  return {
    positiveCount: positives,
    isPositiveScreen: positives >= 4,
  }
}

// Optional broad signal across all 18 indices (0..4)
function scoreASRSBroadFromIdx(all18: number[]) {
  const total = all18.reduce((s, v) => s + v, 0) // 0..72
  const max = 18 * 4
  const pct = Math.round((total / max) * 100)
  return { total, pct }
}

// AQ-10 scoring: 1 point if response matches “key” direction
// Our slider: 0..1 => Disagree; 2..3 => Agree
function scoreAQ10FromIdx(indices: number[]) {
  let score = 0
  indices.forEach((val, i) => {
    const keyedAgree = AQ10_ITEMS[i].keyAgree
    const isAgree = val >= 2
    const isDisagree = val <= 1
    if ((keyedAgree && isAgree) || (!keyedAgree && isDisagree)) score++
  })
  return {
    score, // 0..10
    thresholdReached: score >= 6,
  }
}

/** -------------------- Reusable UI -------------------- */

function LikertSlider({
  value,
  onChange,
  labels,
}: {
  value: number
  onChange: (v: number) => void
  labels: readonly string[]
}) {
  const max = labels.length - 1
  return (
    <div>
      <Slider
        value={[value]}
        min={0}
        max={max}
        step={1}
        onValueChange={(v) => onChange(v[0])}
        className="py-2"
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        {labels.map((l, i) => (
          <span
            key={i}
            className={cn("w-12 text-left", i === 0 ? "" : i === max ? "text-right" : "text-center")}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="mt-1 text-xs">
        Selected: <span className="font-medium">{labels[value]}</span>
      </div>
    </div>
  )
}

/** -------------------- Page -------------------- */

export default function ScreeningPage() {
  const [tool, setTool] = useState<"adhd" | "autism">("adhd")
  const [showPartB, setShowPartB] = useState(false)

  // store indices for sliders
  const [asrsAIdx, setAsrsAIdx] = useState<number[]>(Array(6).fill(0))   // 0..4
  const [asrsBIdx, setAsrsBIdx] = useState<number[]>(Array(12).fill(0))  // 0..4
  const [aq10Idx, setAq10Idx] = useState<number[]>(Array(10).fill(0))    // 0..3

  // results panel
  const [showResults, setShowResults] = useState(false)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  const asrsSummary = useMemo(() => {
    const a = scoreASRSPartAFromIdx(asrsAIdx)
    const broad = scoreASRSBroadFromIdx([...asrsAIdx, ...asrsBIdx])
    return { ...a, broad }
  }, [asrsAIdx, asrsBIdx])

  const aqSummary = useMemo(() => scoreAQ10FromIdx(aq10Idx), [aq10Idx])

  const adhdSeverity =
    asrsSummary.positiveCount >= 4 ? "High (positive screen)"
      : asrsSummary.positiveCount >= 2 ? "Borderline / Mixed"
      : "Low"

  const autismSeverity =
    aqSummary.score >= 6 ? "High (meets common threshold)"
      : aqSummary.score >= 4 ? "Borderline / Mixed"
      : "Low"

  function openResults() {
    setShowResults(true)
    // scroll the results into view for better UX
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0)
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
                    <Label className="text-sm">
                      {i + 1}. {q}
                    </Label>
                    <LikertSlider
                      value={asrsAIdx[i]}
                      onChange={(v) => {
                        const next = [...asrsAIdx]
                        next[i] = v
                        setAsrsAIdx(next)
                      }}
                      labels={ADHD_UI_LABELS}
                    />
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
                      <Label className="text-sm">
                        {i + 7}. {q}
                      </Label>
                      <LikertSlider
                        value={asrsBIdx[i]}
                        onChange={(v) => {
                          const next = [...asrsBIdx]
                          next[i] = v
                          setAsrsBIdx(next)
                        }}
                        labels={ADHD_UI_LABELS}
                      />
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground">
                    Broad severity (informal): {scoreASRSBroadFromIdx([...asrsAIdx, ...asrsBIdx]).total} / 72 (
                    {scoreASRSBroadFromIdx([...asrsAIdx, ...asrsBIdx]).pct}%)
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
                    <Label className="text-sm">
                      {i + 1}. {it.text}
                    </Label>
                    <LikertSlider
                      value={aq10Idx[i]}
                      onChange={(v) => {
                        const next = [...aq10Idx]
                        next[i] = v
                        setAq10Idx(next)
                      }}
                      labels={AQ_LABELS}
                    />
                  </div>
                ))}

                <div className="text-xs text-muted-foreground">
                  A score of <strong>6 or more</strong> is often used to suggest discussing an assessment for autistic traits.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Check Results (no email) */}
        <div className="flex justify-end">
          <Button onClick={openResults}>Check results</Button>
        </div>

        {/* Results Panel */}
        {showResults && (
          <Card ref={resultsRef}>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-lg font-semibold">Your Results (informational only)</h3>

              {tool === "adhd" ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={asrsSummary.isPositiveScreen ? "destructive" : "secondary"}>
                      Part A: {asrsSummary.positiveCount}/6
                    </Badge>
                    <Badge>{adhdSeverity}</Badge>
                    {showPartB && (
                      <Badge variant="outline">
                        Broad: {asrsSummary.broad.total}/72 ({asrsSummary.broad.pct}%)
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm">
                    {asrsSummary.isPositiveScreen
                      ? "Your Part A result meets a commonly used positive ADHD screen. This is not a diagnosis—consider speaking with a clinician."
                      : "Your Part A result does not meet the common threshold for a positive screen. If this still resonates with your lived experience, consider talking with a clinician."}
                  </p>

                  {/* Next steps */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Next steps</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>Book an appointment with your GP and bring examples of how these traits impact work, study, and relationships.</li>
                      <li>
                        UK option: explore{" "}
                        <a
                          href="https://adhduk.co.uk/right-to-choose/"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Right to Choose (ADHD UK)
                        </a>{" "}
                        to understand referral routes and waiting times.
                      </li>
                      <li>Keep a brief symptom journal for 2–4 weeks (situations, impact, strategies that help).</li>
                      <li>If possible, ask a trusted person (partner, parent, friend) to write a brief perspective letter.</li>
                    </ul>
                  </div>

                  {/* Helpful links */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Helpful links</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>
                        <a href="https://adhduk.co.uk/right-to-choose/" target="_blank" rel="noreferrer" className="underline">
                          ADHD UK – Right to Choose
                        </a>
                      </li>
                      <li>
                        <a href="https://www.nhs.uk/conditions/attention-deficit-hyperactivity-disorder-adhd/" target="_blank" rel="noreferrer" className="underline">
                          NHS — ADHD overview
                        </a>
                      </li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={aqSummary.thresholdReached ? "destructive" : "secondary"}>
                      AQ-10: {aqSummary.score}/10
                    </Badge>
                    <Badge>{autismSeverity}</Badge>
                  </div>

                  <p className="text-sm">
                    {aqSummary.thresholdReached
                      ? "Your AQ-10 score meets a commonly used threshold suggesting further assessment for autistic traits may be helpful. This is not a diagnosis."
                      : "Your AQ-10 score is below the common threshold. If this still resonates with your lived experience, consider talking with a clinician."}
                  </p>

                  {/* Next steps */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Next steps</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>Speak with your GP about an autism assessment. Bring concrete examples from school, work, and social settings.</li>
                      <li>Note sensory differences (e.g., sound, light, touch) and any routines/sameness that support you.</li>
                      <li>If comfortable, gather input from someone who knows you well (childhood and adulthood examples can help).</li>
                    </ul>
                  </div>

                  {/* Helpful links */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Helpful links</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>
                        <a href="https://www.autism.org.uk/" target="_blank" rel="noreferrer" className="underline">
                          National Autistic Society (UK)
                        </a>
                      </li>
                      <li>
                        <a href="https://www.nhs.uk/conditions/autism/" target="_blank" rel="noreferrer" className="underline">
                          NHS — Autism overview
                        </a>
                      </li>
                    </ul>
                  </div>
                </>
              )}

              <p className="text-xs text-muted-foreground">
                Reminder: These tools are for information only and cannot diagnose any condition. A qualified clinician
                will consider your history, context, and other factors in a full assessment.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
