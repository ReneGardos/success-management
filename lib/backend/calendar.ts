import { createAdminClient } from "@/lib/supabase/admin"
import { appUrl } from "@/lib/org"

/** Returns (creating once) the private calendar feed URLs for a person. */
export async function calendarFeed(orgId: string, userId: string, kind: "employee" | "customer", refId: string | null) {
  const db = createAdminClient()
  let { data } = await db.from("calendar_feeds").select("token").eq("org_id", orgId).eq("user_id", userId).eq("kind", kind).maybeSingle()
  if (!data) ({ data } = await db.from("calendar_feeds").upsert({ org_id: orgId, user_id: userId, kind, ref_id: refId }, { onConflict: "org_id,user_id,kind" }).select("token").single())
  if (!data) return null
  const https = `${appUrl()}/api/kalender/${data.token}.ics`
  return { https, webcal: https.replace(/^https?:/, "webcal:"), google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(https.replace(/^https?:/, "webcal:"))}` }
}
