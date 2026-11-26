import { MessagesSquare } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import Inbox, { loadInbox } from "./inbox"

export const dynamic = "force-dynamic"
export const metadata = { title: "Beskeder" }

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/beskeder")
  const sp = await searchParams
  const data = await loadInbox(org.id)
  const unread = data.rows.filter((r) => r.unread).length
  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Beskeder</h1><p className="crm-head-sub">Chat med kunder og medarbejdere. {unread ? `${unread} ulæste.` : "Alt er læst."}</p></div></header>
      <div className="cx">
        <Inbox data={data} filter={sp.vis} />
        <section className="cx-pane cx-placeholder"><MessagesSquare className="size-8" /><p>Vælg en samtale, eller start en ny.</p></section>
      </div>
    </main>
  )
}
