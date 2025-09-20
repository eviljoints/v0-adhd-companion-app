// Deno Edge Function
// File: supabase/functions/due-alarms/index.ts
// Sends web push to users for due reminders (covers closed tabs/sleep).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push"

type Appointment = {
  id: string
  user_id: string
  title: string | null
  location_name: string | null
  scheduled_at: string | null
  snoozed_until: string | null
  time_alert_sent: boolean | null
  completed: boolean
}

type Subscription = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET")!
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || ""
    const supaUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const vapidPub = Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY")!
    const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY")!
    const vapidContact = Deno.env.get("VAPID_CONTACT_EMAIL") || "mailto:admin@example.com"

    if (!supaUrl || !serviceRole) {
      return new Response("Missing Supabase env", { status: 500 })
    }
    const authHeader = req.headers.get("authorization") || ""
    if (authHeader !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    const supabase = createClient(supaUrl, serviceRole, { auth: { persistSession: false } })

    // Find due reminders (snoozed_until or scheduled_at <= now)
    const { data: due, error: qerr } = await supabase
      .from("appointments")
      .select("id,user_id,title,location_name,scheduled_at,snoozed_until,time_alert_sent,completed")
      .is("completed", false)
      .eq("time_alert_sent", false)
      .or("snoozed_until.lte.now(),and(snoozed_until.is.null,scheduled_at.lte.now())")

    if (qerr) throw qerr
    if (!due || due.length === 0) return new Response("OK (none due)")

    // Fetch subs for the user set in one go
    const userIds = Array.from(new Set(due.map(d => d.user_id)))
    const { data: subs, error: serr } = await supabase
      .from("web_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .in("user_id", userIds)
    if (serr) throw serr

    webpush.setVapidDetails(`mailto:${vapidContact}`, vapidPub, vapidPriv)

    for (const apt of due as Appointment[]) {
      const userSubs = (subs || []).filter((s) => s.user_id === apt.user_id)

      // Build payload
      const title = apt.title || "Reminder"
      const body = apt.location_name ? `${apt.location_name}` : "Time’s up!"
      const payload = JSON.stringify({
        title,
        body,
        tag: `apt-${apt.id}`,
        data: { url: `${siteUrl || ""}/appointments` },
      })

      for (const sub of userSubs as Subscription[]) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            } as any,
            payload
          )
        } catch (err: any) {
          // Gone → delete subscription
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from("web_push_subscriptions").delete().eq("id", sub.id)
          }
        }
      }

      // Mark as sent
      await supabase
        .from("appointments")
        .update({ time_alert_sent: true, updated_at: new Date().toISOString() })
        .eq("id", apt.id)
    }

    return new Response(`OK (sent ${due.length})`)
  } catch (e) {
    return new Response(`Error: ${e?.message || e}`, { status: 500 })
  }
})
