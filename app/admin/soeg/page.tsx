import Link from "next/link"
import { Contact, FileSignature, Kanban, MapPin, MessageSquare, Receipt } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr } from "@/lib/backend/quotes"
import { invoiceNo } from "@/lib/backend/invoices"

export const dynamic = "force-dynamic"
export const metadata = { title: "Søg" }

type Hit = { href: string; title: string; sub: string }

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/soeg")
  const raw = (await searchParams).q ?? ""
  const q = raw.replace(/[%,()*"\\]/g, "").trim().slice(0, 80)
  const groups: { label: string; icon: typeof Contact; hits: Hit[] }[] = []

  if (q.length >= 2) {
    const db = createAdminClient()
    const like = `%${q}%`
    const num = /^\d+$/.test(q) ? Number(q) : null
    const [customers, leads, requests, quotes, invoices, locations] = await Promise.all([
      db.from("customers").select("id, name, company, email").eq("org_id", org.id).or(`name.ilike.${like},company.ilike.${like},email.ilike.${like},contact_name.ilike.${like}`).limit(10),
      db.from("leads").select("id, name, company, email, status").eq("org_id", org.id).or(`name.ilike.${like},company.ilike.${like},email.ilike.${like}`).limit(10),
      db.from("contact_requests").select("id, name, email, created_at").eq("org_id", org.id).or(`name.ilike.${like},email.ilike.${like},message.ilike.${like}`).order("created_at", { ascending: false }).limit(10),
      db.from("quotes").select("id, quote_number, recipient_company, recipient_name, title, total").eq("org_id", org.id).or(`recipient_company.ilike.${like},recipient_name.ilike.${like},recipient_email.ilike.${like},title.ilike.${like}${num !== null ? `,quote_number.eq.${num}` : ""}`).limit(10),
      db.from("invoices").select("id, invoice_number, credit_of, recipient_company, recipient_name, total").eq("org_id", org.id).or(`recipient_company.ilike.${like},recipient_name.ilike.${like},recipient_email.ilike.${like},title.ilike.${like}${num !== null ? `,invoice_number.eq.${num}` : ""}`).limit(10),
      db.from("locations").select("id, name, address").eq("org_id", org.id).or(`name.ilike.${like},address.ilike.${like}`).limit(10),
    ])
    groups.push(
      { label: "Kunder", icon: Contact, hits: (customers.data ?? []).map((c) => ({ href: `/admin/kunder/${c.id}`, title: c.company || c.name, sub: c.email ?? "" })) },
      { label: "Leads", icon: Kanban, hits: (leads.data ?? []).map((l) => ({ href: `/admin/leads/${l.id}`, title: l.company || l.name, sub: `${l.email} · ${l.status}` })) },
      { label: "Henvendelser", icon: MessageSquare, hits: (requests.data ?? []).map((r) => ({ href: `/admin/mail/${r.id}`, title: r.name, sub: `${r.email} · ${new Date(r.created_at).toLocaleDateString("da-DK")}` })) },
      { label: "Tilbud", icon: FileSignature, hits: (quotes.data ?? []).map((t) => ({ href: `/admin/tilbud/${t.id}`, title: `#${t.quote_number} · ${t.recipient_company || t.recipient_name || "Uden kunde"}`, sub: `${t.title ?? ""} · ${kr(Number(t.total ?? 0))}` })) },
      { label: "Fakturaer", icon: Receipt, hits: (invoices.data ?? []).map((i) => ({ href: `/admin/fakturaer/${i.id}`, title: `${invoiceNo(org, i)} · ${i.recipient_company || i.recipient_name || "Uden kunde"}`, sub: kr(Number(i.total)) })) },
      { label: "Steder", icon: MapPin, hits: (locations.data ?? []).map((l) => ({ href: `/admin/steder`, title: l.name, sub: l.address })) },
    )
  }
  const total = groups.reduce((s, g) => s + g.hits.length, 0)

  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Søg</h1><p className="crm-head-sub">{q.length >= 2 ? `${total} resultater for “${q}”` : "Skriv mindst to tegn i søgefeltet øverst."}</p></div></header>
      <form className="crm-search-big" role="search"><input name="q" defaultValue={raw} autoFocus placeholder="Kunde, email, tilbudsnr., fakturanr., adresse…" aria-label="Søg" /></form>
      <div className="crm-grid-2">
        {groups.filter((g) => g.hits.length).map(({ label, icon: Icon, hits }) => (
          <article className="crm-card" key={label}>
            <header className="crm-card-head"><div><h2><Icon className="size-4 inline" /> {label}</h2></div></header>
            <ul className="crm-list">{hits.map((h) => <li key={h.href + h.title}><Link href={h.href}>{h.title}</Link><small>{h.sub}</small></li>)}</ul>
          </article>
        ))}
      </div>
    </main>
  )
}
