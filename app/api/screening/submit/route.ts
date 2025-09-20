import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Optional email via Resend (npm i resend)
let resend: any = null
try {
  const { Resend } = require("resend")
  if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }
} catch {
  // Resend not installed; skip emailing.
}

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const email = String(body?.email || "").trim()
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 })
    }

    // Persist to Supabase (screening_results table)
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return NextResponse.json({ error: "Server missing Supabase env." }, { status: 500 })
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

    const { error: dbErr } = await supabase
      .from("screening_results")
      .insert([{
        email,
        tool: String(body?.tool || "unknown"),
        answers: body?.answers ?? null,
        scores: body?.scores ?? null,
        interpretation: body?.interpretation ?? null,
      }])

    if (dbErr) {
      console.error("DB insert error:", dbErr)
      return NextResponse.json({ error: "Failed to save." }, { status: 500 })
    }

    // Compose email summary
    const subject = `Your ${body.tool || "screening"} results`
    const summaryHtml = `
      <h2>${body.tool || "Screening"} Results</h2>
      <p><em>Informational only — not a diagnosis.</em></p>
      <pre style="white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace">
${JSON.stringify({ answers: body.answers, scores: body.scores }, null, 2)}
      </pre>
      <p>${body?.interpretation || ""}</p>
      <p style="color:#666;font-size:12px;">
        If these results resonate with your experience, consider contacting a qualified clinician for a full assessment.
      </p>
    `

    // Try to email (optional)
    if (resend) {
      try {
        await resend.emails.send({
          from: process.env.RESULTS_FROM_EMAIL || "results@yourapp.example",
          to: email,
          subject,
          html: summaryHtml,
        })
        return NextResponse.json({ message: "Saved and emailed." })
      } catch (mailErr: any) {
        console.warn("Email send failed:", mailErr?.message || mailErr)
        return NextResponse.json({ message: "Saved. Email could not be sent (provider not configured)." })
      }
    }

    return NextResponse.json({ message: "Saved. Email sending is not configured." })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 })
  }
}
