import { createAdminClient } from "@/lib/supabase/admin"
import { buildIcs, type IcsEvent } from "@/lib/ics"
import { appUrl } from "@/lib/org"

export const dynamic = "force-dynamic"

/** Private calendar feed: an employee's shifts or a customer's visits (subscribe from phone/Outlook/Google). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "")
  if (!/^[a-f0-9]{36}$/.test(token)) return new Response("Not found", { status: 404 })
  const db = createAdminClient()
  const { data: feed } = await db.from("calendar_feeds").select("org_id, user_id, kind, ref_id").eq("token", token).maybeSingle()
  if (!feed) return new Response("Not found", { status: 404 })
  // Access must still be valid (membership not removed).
  const { data: member } = await db.from("memberships").select("role").eq("org_id", feed.org_id).eq("user_id", feed.user_id).maybeSingle()
  if (!member) return new Response("Gone", { status: 410 })
  const { data: org } = await db.from("organizations").select("name").eq("id", feed.org_id).maybeSingle()
  const from = new Date(Date.now() - 30 * 86400000).toISOString()
  const to = new Date(Date.now() + 180 * 86400000).toISOString()
  const cols = "id, title, scheduled_start, scheduled_end, status, notes, updated_at, location:locations(name, address, access_notes)"
  type Row = { id: string; title: string | null; scheduled_start: string | null; scheduled_end: string | null; status: string; notes: string | null; updated_at: string | null; location: { name: string; address: string | null; access_notes: string | null } | null }
  let rows: Row[] = []
  if (feed.kind === "employee") {
    const { data: a } = await db.from("job_assignments").select("job_id").eq("org_id", feed.org_id).eq("employee_id", feed.user_id)
    const ids = (a ?? []).map((x) => x.job_id)
    if (ids.length) rows = ((await db.from("jobs").select(cols).eq("org_id", feed.org_id).in("id", ids).gte("scheduled_start", from).lte("scheduled_start", to)).data ?? []) as unknown as Row[]
  } else if (feed.ref_id) {
    const { data: locs } = await db.from("locations").select("id").eq("org_id", feed.org_id).eq("customer_id", feed.ref_id)
    const ids = (locs ?? []).map((l) => l.id)
    if (ids.length) rows = ((await db.from("jobs").select(cols).eq("org_id", feed.org_id).in("location_id", ids).gte("scheduled_start", from).lte("scheduled_start", to)).data ?? []) as unknown as Row[]
  }
  const base = appUrl()
  const events: IcsEvent[] = rows.filter((r) => r.scheduled_start).map((r) => ({
    uid: `${r.id}@success-management`,
    start: r.scheduled_start!,
    end: r.scheduled_end,
    title: feed.kind === "employee" ? `Vagt: ${r.location?.name ?? r.title ?? "Rengøring"}` : `${org?.name ?? "Rengøring"}: ${r.title ?? "Besøg"}`,
    location: r.location?.address ?? r.location?.name ?? null,
    description: [feed.kind === "employee" ? r.location?.access_notes : null, feed.kind === "employee" ? r.notes : null].filter(Boolean).join("\n") || null,
    url: feed.kind === "employee" ? `${base}/medarbejder/vagter` : `${base}/kunde/besoeg`,
    cancelled: r.status === "cancelled",
    updated: r.updated_at,
  }))
  const name = feed.kind === "employee" ? `${org?.name ?? ""} – mine vagter` : `${org?.name ?? ""} – besøg`
  return new Response(buildIcs(name.trim(), events), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300", "Content-Disposition": `inline; filename="kalender.ics"` } })
}
