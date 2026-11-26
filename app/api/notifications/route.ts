import { NextResponse } from "next/server"
import { getOrgContext } from "@/lib/org"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/** Bell: latest notifications for the signed-in user in the active organization. */
export async function GET() {
  const ctx = await getOrgContext()
  if (!ctx?.org) return NextResponse.json({ unread: 0, items: [] }, { status: ctx ? 200 : 401 })
  const db = createAdminClient()
  const [{ data: items }, { count }] = await Promise.all([
    db.from("notifications").select("id, kind, title, body, href, read_at, created_at").eq("user_id", ctx.user.id).eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(25),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("org_id", ctx.org.id).is("read_at", null),
  ])
  return NextResponse.json({ unread: count ?? 0, items: items ?? [] }, { headers: { "Cache-Control": "no-store" } })
}

/** Mark one ({ id }) or all notifications read. */
export async function POST(request: Request) {
  const ctx = await getOrgContext()
  if (!ctx?.org) return NextResponse.json({ ok: false }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { id?: string }
  let q = createAdminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).eq("org_id", ctx.org.id).is("read_at", null)
  if (body.id && /^[0-9a-f-]{36}$/i.test(body.id)) q = q.eq("id", body.id)
  await q
  return NextResponse.json({ ok: true })
}
