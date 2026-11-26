import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { pushConfigured, sendPush } from "@/lib/backend/push"
import type { Org } from "@/lib/org"

export type Note = { kind: string; title: string; body?: string | null; href?: string | null }

async function pushAll(userIds: string[], payload: Record<string, unknown>) {
  if (!pushConfigured() || !userIds.length) return
  const db = createAdminClient()
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds)
  await Promise.allSettled((subs ?? []).map(async (s) => {
    const r = await sendPush(s, payload)
    if (r === "gone") await db.from("push_subscriptions").delete().eq("id", s.id)
    else if (r === "ok") await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id)
  }))
}

/** In-app notification (bell) + web push to each user's devices. Never throws. */
export async function notifyUsers(org: Pick<Org, "id" | "name">, userIds: (string | null | undefined)[], note: Note) {
  const ids = [...new Set(userIds.filter((v): v is string => Boolean(v)))]
  if (!ids.length) return
  try {
    await createAdminClient().from("notifications").insert(ids.map((user_id) => ({ org_id: org.id, user_id, kind: note.kind, title: note.title.slice(0, 160), body: note.body?.slice(0, 400) ?? null, href: note.href ?? null })))
    const payload = { title: note.title, body: note.body ?? "", href: note.href ?? "/", tag: `${note.kind}-${org.id}`, org: org.name }
    try { after(() => pushAll(ids, payload)) } catch { await pushAll(ids, payload) }
  } catch (e) {
    console.error("notify failed", e)
  }
}

export async function adminUserIds(orgId: string) {
  const { data } = await createAdminClient().from("memberships").select("user_id").eq("org_id", orgId).in("role", ["owner", "admin"])
  return (data ?? []).map((m) => String(m.user_id))
}

export async function customerUserIds(orgId: string, customerId: string | null | undefined) {
  if (!customerId) return []
  const { data } = await createAdminClient().rpc("customer_user_ids", { p_org: orgId, p_customer: customerId })
  return ((data as string[] | null) ?? []).map(String)
}

export async function notifyAdmins(org: Pick<Org, "id" | "name">, note: Note, exceptUserId?: string) {
  const ids = (await adminUserIds(org.id)).filter((id) => id !== exceptUserId)
  await notifyUsers(org, ids, note)
}

export async function notifyCustomer(org: Pick<Org, "id" | "name">, customerId: string | null | undefined, note: Note) {
  await notifyUsers(org, await customerUserIds(org.id, customerId), note)
}
