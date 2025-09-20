// supabase/functions/send-due-alarms/index.ts
// Sends push notifications for appointments that are due (time-based).
// Runs safely every minute; only sends when something is due.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import webpush from "npm:web-push";
import { createClient } from "npm:@supabase/supabase-js";

type Appointment = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  location_name: string | null;
  scheduled_at: string | null;
  time_alert_sent: boolean | null;
  completed: boolean;
};

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

serve(async (req: Request) => {
  try {
    // Optional: simple token guard if you want to invoke manually
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    if (CRON_SECRET && token !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_CONTACT_EMAIL = Deno.env.get("VAPID_CONTACT_EMAIL") || "mailto:admin@example.com";

    webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Find due time-based appointments: scheduled_at <= now, not completed, not yet sent
    const { data: due, error } = await supabase
      .from("appointments")
      .select(
        "id,user_id,title,description,location_name,scheduled_at,time_alert_sent,completed"
      )
      .lte("scheduled_at", new Date().toISOString())
      .or("time_alert_sent.is.null,time_alert_sent.eq.false")
      .eq("completed", false)
      .limit(500);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Group by user_id
    const byUser = new Map<string, Appointment[]>();
    for (const a of due) {
      if (!byUser.has(a.user_id)) byUser.set(a.user_id, []);
      byUser.get(a.user_id)!.push(a);
    }

    let sentCount = 0;

    for (const [userId, items] of byUser.entries()) {
      const { data: subs, error: subErr } = await supabase
        .from("web_push_subscriptions")
        .select("id,user_id,endpoint,p256dh,auth")
        .eq("user_id", userId);

      if (subErr || !subs || subs.length === 0) continue;

      for (const apt of items) {
        const payload = {
          title: apt.title || "Reminder",
          body: apt.location_name ? `${apt.location_name}` : "Your reminder is due.",
          tag: `apt-${apt.id}`,
          data: { url: "/appointments", appointmentId: apt.id },
        };

        for (const sub of subs as Subscription[]) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              } as any,
              JSON.stringify(payload)
            );
            sentCount++;
          } catch (pushErr: any) {
            const status = pushErr?.statusCode || pushErr?.status || 0;
            // Clean up dead endpoints
            if (status === 404 || status === 410) {
              await supabase.from("web_push_subscriptions").delete().eq("id", sub.id);
            } else {
              console.warn("Push error:", status, pushErr?.message);
            }
          }
        }

        // Mark as sent so we don't resend
        await supabase
          .from("appointments")
          .update({ time_alert_sent: true, updated_at: new Date().toISOString() })
          .eq("id", apt.id);
      }
    }

    return new Response(JSON.stringify({ sent: sentCount }), { status: 200 });
  } catch (e) {
    console.error("send-due-alarms error:", e);
    return new Response(JSON.stringify({ error: "failed" }), { status: 500 });
  }
});
