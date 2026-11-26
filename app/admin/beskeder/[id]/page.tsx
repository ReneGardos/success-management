import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Phone } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadMessages, loadThread, markRead } from "@/lib/backend/chat"
import ChatView from "@/components/chat-view"
import { chatUploadTarget, registerChatPhoto, sendChat } from "@/app/beskeder/actions"
import Inbox, { loadInbox } from "../inbox"

export const dynamic = "force-dynamic"
export const metadata = { title: "Samtale" }

export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vis?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/beskeder")
  const { id } = await params
  const sp = await searchParams
  const thread = await loadThread(org.id, id)
  if (!thread) notFound()
  const db = createAdminClient()
  const [messages, data, who] = await Promise.all([
    loadMessages(org.id, thread.id),
    loadInbox(org.id),
    thread.kind === "customer"
      ? db.from("customers").select("name, company, phone, email").eq("org_id", org.id).eq("id", thread.customer_id!).maybeSingle().then((r) => r.data)
      : db.from("profiles").select("full_name, phone").eq("id", thread.employee_id!).maybeSingle().then((r) => r.data ? { name: r.data.full_name, company: null, phone: r.data.phone, email: null } : null),
  ])
  await markRead(thread, "office")
  const name = who ? (who.company || who.name) : "Ukendt"
  return (
    <main className="admin-shell crm">
      <div className="cx is-open">
        <Inbox data={data} activeId={thread.id} filter={sp.vis} />
        <section className="cx-pane">
          <header className="cx-head">
            <Link href="/admin/beskeder" className="cx-back" aria-label="Tilbage"><ArrowLeft className="size-5" /></Link>
            <div><strong>{name}</strong><small>{thread.kind === "customer" ? "Kunde" : "Medarbejder"}{who?.email ? ` · ${who.email}` : ""}</small></div>
            {who?.phone && <a href={`tel:${who.phone.replace(/\s+/g, "")}`} className="crm-btn"><Phone className="size-4" /> Ring</a>}
            {thread.kind === "customer" && <Link href={`/admin/kunder/${thread.customer_id}`} className="crm-btn">Kundekort</Link>}
          </header>
          <ChatView messages={messages} side="office" send={sendChat.bind(null, thread.id)} uploadTarget={chatUploadTarget.bind(null, thread.id)} registerPhoto={registerChatPhoto.bind(null, thread.id)} placeholder={`Skriv til ${name}…`} />
        </section>
      </div>
    </main>
  )
}
