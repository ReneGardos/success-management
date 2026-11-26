import { createAdminClient } from "@/lib/supabase/admin"
import { signedUrls } from "@/lib/backend/reports"

export type ChatThread = { id: string; org_id: string; kind: "customer" | "employee"; customer_id: string | null; employee_id: string | null; last_message_at: string | null; last_preview: string | null; last_from_office: boolean; office_read_at: string | null; member_read_at: string | null }
export type ChatMessage = { id: string; author_name: string | null; author_user_id: string | null; from_office: boolean; body: string | null; created_at: string; photos: string[]; job: { title: string | null; scheduled_start: string | null } | null }

const COLS = "id, org_id, kind, customer_id, employee_id, last_message_at, last_preview, last_from_office, office_read_at, member_read_at"

/** Finds (and optionally creates) the one thread a customer or employee has with the office. */
export async function threadFor(orgId: string, kind: "customer" | "employee", refId: string, create = true): Promise<ChatThread | null> {
  const db = createAdminClient()
  const col = kind === "customer" ? "customer_id" : "employee_id"
  const { data } = await db.from("chat_threads").select(COLS).eq("org_id", orgId).eq("kind", kind).eq(col, refId).maybeSingle()
  if (data || !create) return (data as ChatThread | null) ?? null
  const { data: made, error } = await db.from("chat_threads").insert({ org_id: orgId, kind, [col]: refId }).select(COLS).single()
  if (error) {
    const { data: again } = await db.from("chat_threads").select(COLS).eq("org_id", orgId).eq("kind", kind).eq(col, refId).maybeSingle()
    return (again as ChatThread | null) ?? null
  }
  return made as ChatThread
}

export async function loadThread(orgId: string, id: string): Promise<ChatThread | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await createAdminClient().from("chat_threads").select(COLS).eq("org_id", orgId).eq("id", id).maybeSingle()
  return (data as ChatThread | null) ?? null
}

export async function loadMessages(orgId: string, threadId: string, limit = 150): Promise<ChatMessage[]> {
  const db = createAdminClient()
  const { data } = await db.from("chat_messages").select("id, author_name, author_user_id, from_office, body, created_at, job:jobs(title, scheduled_start)").eq("org_id", orgId).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(limit)
  const rows = (data ?? []).reverse()
  const ids = rows.map((m) => m.id)
  const { data: photos } = ids.length ? await db.from("photos").select("message_id, path").eq("org_id", orgId).in("message_id", ids) : { data: [] }
  const urls = await signedUrls((photos ?? []).map((p) => p.path))
  const byMsg = new Map<string, string[]>()
  for (const p of photos ?? []) { const u = urls.get(p.path); if (u) byMsg.set(p.message_id!, [...(byMsg.get(p.message_id!) ?? []), u]) }
  return rows.map((m) => ({ ...m, job: m.job as unknown as ChatMessage["job"], photos: byMsg.get(m.id) ?? [] }))
}

export async function markRead(thread: ChatThread, side: "office" | "member") {
  await createAdminClient().from("chat_threads").update(side === "office" ? { office_read_at: new Date().toISOString() } : { member_read_at: new Date().toISOString() }).eq("id", thread.id)
}

export const isUnread = (t: Pick<ChatThread, "last_message_at" | "last_from_office" | "office_read_at" | "member_read_at">, side: "office" | "member") =>
  Boolean(t.last_message_at) && (side === "office" ? !t.last_from_office && (!t.office_read_at || t.office_read_at < t.last_message_at!) : t.last_from_office && (!t.member_read_at || t.member_read_at < t.last_message_at!))

/** Unread office messages for a member (badge in the portal menu). */
export async function memberUnread(orgId: string, kind: "customer" | "employee", refId: string | null | undefined) {
  if (!refId) return 0
  const t = await threadFor(orgId, kind, refId, false)
  if (!t || !isUnread(t, "member")) return 0
  let q = createAdminClient().from("chat_messages").select("id", { count: "exact", head: true }).eq("thread_id", t.id).eq("from_office", true)
  if (t.member_read_at) q = q.gt("created_at", t.member_read_at)
  const { count } = await q
  return count ?? 0
}
