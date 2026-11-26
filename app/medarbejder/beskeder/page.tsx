import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { loadMessages, markRead, threadFor } from "@/lib/backend/chat"
import ChatView from "@/components/chat-view"
import { chatUploadTarget, registerChatPhoto, sendChat } from "@/app/beskeder/actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Beskeder" }

export default async function EmployeeMessages() {
  const p = await employeePortal("/medarbejder/beskeder")
  const thread = await threadFor(p.org.id, "employee", p.userId, !p.preview)
  const db = createAdminClient()
  const [messages, { data: assigned }] = await Promise.all([
    thread ? loadMessages(p.org.id, thread.id) : Promise.resolve([]),
    db.from("job_assignments").select("job:jobs(id, title, scheduled_start, location:locations(name))").eq("org_id", p.org.id).eq("employee_id", p.userId).limit(200),
  ])
  if (thread && !p.preview) await markRead(thread, "member")
  const from = Date.now() - 3 * 86400000
  const to = Date.now() + 14 * 86400000
  const jobs = (assigned ?? [])
    .map((a) => a.job as unknown as { id: string; title: string | null; scheduled_start: string | null; location: { name: string } | null } | null)
    .filter((j): j is NonNullable<typeof j> => Boolean(j?.scheduled_start) && new Date(j!.scheduled_start!).getTime() > from && new Date(j!.scheduled_start!).getTime() < to)
    .sort((a, b) => a.scheduled_start!.localeCompare(b.scheduled_start!))
    .map((j) => ({ id: j.id, label: `${new Date(j.scheduled_start!).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })} · ${j.location?.name ?? j.title ?? "Vagt"}` }))
  const live = thread && !p.preview
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Beskeder</h1><p>Direkte til kontoret. Vælg en vagt, hvis beskeden handler om en bestemt opgave.</p></header>
      <ChatView messages={messages} side="member" jobs={jobs} send={live ? sendChat.bind(null, thread.id) : undefined} uploadTarget={live ? chatUploadTarget.bind(null, thread.id) : undefined} registerPhoto={live ? registerChatPhoto.bind(null, thread.id) : undefined} emptyText="Spørgsmål om en vagt, nøgler eller andet? Skriv til kontoret her." />
    </main>
  )
}
