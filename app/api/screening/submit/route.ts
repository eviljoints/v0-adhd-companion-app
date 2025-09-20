import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

// ---- Env (use your names, with a fallback for the URL) ----
const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESULTS_FROM_EMAIL = process.env.RESULTS_FROM_EMAIL
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY")
if (!RESULTS_FROM_EMAIL) throw new Error("Missing RESULTS_FROM_EMAIL")
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL")
if (!SERVICE_ROLE) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")

const resend = new Resend(RESEND_API_KEY)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const escapeHTML = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const email = String(body?.email || "").trim()
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 })
    }

    const tool = String(body?.tool || "unknown")
    const answers = body?.answers ?? null
    const scores = body?.scores ?? null
    const interpretation = String(body?.interpretation || "")
    const createdAt = new Date().toISOString()

    // Save to Supabase
    const { error: dbErr } = await supabase
      .from("screening_results")
      .insert([{ email, tool, answers, scores, interpretation, created_at: createdAt }])

    if (dbErr) {
      console.error("DB insert error:", dbErr)
      return NextResponse.json({ error: "Failed to save results." }, { status: 500 })
    }

    // Compose email
    const subject = `Your ${tool} results`
    const pretty = JSON.stringify({ answers, scores }, null, 2)
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
        <h2 style="margin:0 0 8px 0">${escapeHTML(tool)} Results</h2>
        <p style="margin:0 0 12px 0"><em>Informational only — not a diagnosis.</em></p>
        <pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.4">
${escapeHTML(pretty)}
        </pre>
        ${interpretation ? `<p style="margin:12px 0">${escapeHTML(interpretation)}</p>` : ""}
        <p style="margin:12px 0 0 0;color:#64748b;font-size:12px">
          If these results resonate with your experience, consider contacting a qualified clinician for a full assessment.
        </p>
      </div>
    `
    const text =
`${tool} Results (informational only — not a diagnosis)

${pretty}

${interpretation}

If these results resonate with your experience, consider contacting a qualified clinician for a full assessment.`

    // Send email via Resend (hard-required)
    await resend.emails.send({
      from: RESULTS_FROM_EMAIL!,
      to: email,
      subject,
      html,
      text,
    })

    return NextResponse.json({ message: "Saved and emailed." })
  } catch (e: any) {
    console.error("Submit error:", e?.message || e)
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 })
  }
}
