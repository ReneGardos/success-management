"use server"

import { revalidatePath } from "next/cache"
import { requireRoleAction } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminRole } from "@/lib/org"
import { getViewAs } from "@/lib/view-as"
import { customerIdsFor } from "@/lib/backend/customers"
import { loadThread, type ChatThread } from "@/lib/backend/chat"
import { notifyAdmins, notifyCustomer, notifyUsers } from "@/lib/backend/notify"
import { pathAllowed, photoUploadTarget } from "@/lib/backend/reports"

/** Who may write in a thread: the office (admins) or the customer/employee it belongs to. */
async function access(threadId: string) {
  const g = await requireRoleAction(["admin", "employee", "customer"])
  if (await getViewAs(g.ctx)) throw new Error("Visning er skrivebeskyttet.")
  const thread = await loadThread(g.org.id, threadId)
  if (!thread) throw new Error("Samtalen findes ikke.")
  const office = isAdminRole(g.orgRole)
  if (!office) {
    if (thread.kind === "employee" && thread.employee_id !== g.user.id) throw new Error("Ingen adgang.")
    if (thread.kind === "customer" && !(await customerIdsFor(g.org.id, g.user.id, g.user.email)).includes(String(thread.customer_id))) throw new Error("Ingen adgang.")
  }
  return { ...g, thread, office }
}

async function authorName(userId: string, fallback: string | null) {
  const { data } = await createAdminClient().from("profiles").select("full_name").eq("id", userId).maybeSingle()
  return data?.full_name || fallback || "Ukendt"
}

async function afterPost(a: Awaited<ReturnType<typeof access>>, preview: string, name: string) {
  const db = createAdminClient()
  const now = new Date().toISOString()
  await db.from("chat_threads").update({ last_message_at: now, last_preview: preview.slice(0, 140), last_from_office: a.office, ...(a.office ? { office_read_at: now } : { member_read_at: now }) }).eq("id", a.thread.id)
  const t: ChatThread = a.thread
  if (a.office) {
    const note = { kind: "chat", title: `Ny besked fra ${a.org.name}`, body: preview }
    if (t.kind === "employee") await notifyUsers(a.org, [t.employee_id], { ...note, href: "/medarbejder/beskeder" })
    else await notifyCustomer(a.org, t.customer_id, { ...note, href: "/kunde/beskeder" })
  } else {
    await notifyAdmins(a.org, { kind: "chat", title: `Besked fra ${name}`, body: preview, href: `/admin/beskeder/${t.id}` })
  }
  revalidatePath("/admin/beskeder", "layout")
}

export async function sendChat(threadId: string, formData: FormData): Promise<{ ok: boolean; message?: string }> {
  try {
    const a = await access(threadId)
    const body = String(formData.get("body") ?? "").trim().slice(0, 4000)
    if (!body) return { ok: false, message: "Skriv en besked." }
    const jobId = String(formData.get("job_id") ?? "")
    const name = await authorName(a.user.id, a.user.email)
    const { error } = await createAdminClient().from("chat_messages").insert({ org_id: a.org.id, thread_id: a.thread.id, author_user_id: a.user.id, author_name: name, from_office: a.office, body, job_id: /^[0-9a-f-]{36}$/i.test(jobId) ? jobId : null })
    if (error) return { ok: false, message: "Beskeden blev ikke sendt." }
    await afterPost(a, body, name)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Fejl" }
  }
}

export async function chatUploadTarget(threadId: string) {
  const a = await access(threadId)
  return photoUploadTarget(a.org.id, `chat/${a.thread.id}`, "image/jpeg")
}

export async function registerChatPhoto(threadId: string, path: string, _kind: string, caption: string) {
  try {
    const a = await access(threadId)
    if (!pathAllowed(a.org.id, `chat/${a.thread.id}`, path)) return { ok: false, message: "Ugyldigt billede." }
    const db = createAdminClient()
    const name = await authorName(a.user.id, a.user.email)
    const { data: msg, error } = await db.from("chat_messages").insert({ org_id: a.org.id, thread_id: a.thread.id, author_user_id: a.user.id, author_name: name, from_office: a.office, body: caption.trim().slice(0, 500) || null }).select("id").single()
    if (error || !msg) return { ok: false, message: "Billedet blev ikke sendt." }
    await db.from("photos").insert({ org_id: a.org.id, message_id: msg.id, uploaded_by: a.user.id, kind: "chat", path })
    await afterPost(a, caption.trim() ? `📷 ${caption.trim()}` : "📷 Billede", name)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Fejl" }
  }
}
