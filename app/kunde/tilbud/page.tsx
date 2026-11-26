import { FileText } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { kr, statusLabels } from "@/lib/backend/quotes"

export const dynamic = "force-dynamic"
export const metadata = { title: "Tilbud" }

export default async function CustomerQuotes() {
  const p = await customerPortal("/kunde/tilbud")
  const { data: quotes } = await createAdminClient().from("quotes").select("id, quote_number, title, status, total, billing, public_token, valid_until, created_at").eq("org_id", p.org.id).neq("status", "draft").in("customer_id", p.ids).order("created_at", { ascending: false }).limit(50)
  const open = (quotes ?? []).filter((q) => q.status === "sent")
  const rest = (quotes ?? []).filter((q) => q.status !== "sent")
  const row = (q: NonNullable<typeof quotes>[number]) => (
    <li key={q.id}>
      <a href={`/t/${q.public_token}`}><strong>#{q.quote_number} · {q.title}</strong><small>{new Date(q.created_at).toLocaleDateString("da-DK")}{q.valid_until ? ` · gyldigt til ${new Date(`${q.valid_until}T12:00:00Z`).toLocaleDateString("da-DK")}` : ""}</small></a>
      <b><span className={`pt-pill q-${q.status}`}>{statusLabels[q.status] ?? q.status}</span>{q.total ? ` ${kr(Number(q.total))}${q.billing === "one_time" ? "" : "/md."}` : ""}</b>
    </li>
  )
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Tilbud</h1><p>Åbn et tilbud for at se det hele og acceptere det.</p></header>
      {open.length > 0 && <section className="pt-card pt-warn"><h2><FileText className="size-4 inline" /> Venter på jeres svar</h2><ul className="pt-mini">{open.map(row)}</ul></section>}
      <section className="pt-card"><h2>Alle tilbud</h2><ul className="pt-mini">{rest.map(row)}{!rest.length && <li className="pt-empty">Ingen tidligere tilbud.</li>}</ul></section>
    </main>
  )
}
