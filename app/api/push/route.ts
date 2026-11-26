import { NextResponse } from "next/server"
import { getOrgContext } from "@/lib/org"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

const allowedHost = (u: string) => {
  try {
    const h = new URL(u).hostname
    return new URL(u).protocol === "https:" && /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com|push\.apple\.com)$/.test(h)
  } catch { return false }
}

/** Save a browser push subscription for the signed-in user. */
export async function POST(request: Request) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 })
  const sub = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null
  const endpoint = sub?.endpoint ?? ""
  const p256dh = sub?.keys?.p256dh ?? ""
  const auth = sub?.keys?.auth ?? ""
  if (!allowedHost(endpoint) || endpoint.length > 1000 || !/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,40}$/.test(auth)) return NextResponse.json({ ok: false }, { status: 400 })
  await createAdminClient().from("push_subscriptions").upsert({ endpoint, p256dh, auth, user_id: ctx.user.id, user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null }, { onConflict: "endpoint" })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 })
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string }
  if (endpoint) await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", ctx.user.id)
  return NextResponse.json({ ok: true })
}
