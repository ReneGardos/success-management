import Link from "next/link"
import { Plus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr } from "@/lib/backend/quotes"
import { createCustomer } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kunder" }

const statusLabels: Record<string, string> = { active: "Aktiv", paused: "Pause", former: "Tidligere" }

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; vis?: string; ny?: string; fejl?: string; slettet?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/kunder")
  const sp = await searchParams
  const db = createAdminClient()
  let query = db.from("customers").select("id, name, company, contact_name, email, phone, status, monthly_value, created_at").eq("org_id", org.id).order("name").limit(1000)
  const q = (sp.q ?? "").replace(/[%,()*"\\]/g, "").trim().slice(0, 80)
  if (q) query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%,contact_name.ilike.%${q}%`)
  if (sp.vis && sp.vis in statusLabels) query = query.eq("status", sp.vis)
  const [{ data, error }, { data: inv }, { data: locs }] = await Promise.all([
    query,
    db.from("invoices").select("customer_id, total, status").eq("org_id", org.id).not("customer_id", "is", null).limit(10000),
    db.from("locations").select("customer_id").eq("org_id", org.id).not("customer_id", "is", null),
  ])
  const rows = data ?? []
  const revenue = new Map<string, number>()
  const unpaid = new Map<string, number>()
  for (const i of inv ?? []) {
    if (i.status === "paid") revenue.set(String(i.customer_id), (revenue.get(String(i.customer_id)) ?? 0) + Number(i.total))
    if (i.status === "sent") unpaid.set(String(i.customer_id), (unpaid.get(String(i.customer_id)) ?? 0) + Number(i.total))
  }
  const locCount = new Map<string, number>()
  for (const l of locs ?? []) locCount.set(String(l.customer_id), (locCount.get(String(l.customer_id)) ?? 0) + 1)
  const mrr = rows.filter((r) => r.status === "active").reduce((s, r) => s + Number(r.monthly_value ?? 0), 0)

  return (
    <main className="admin-shell crm">
      <header className="crm-head">
        <div><p className="crm-kicker">{org.name}</p><h1>Kunder</h1><p className="crm-head-sub">{rows.filter((r) => r.status === "active").length} aktive · {kr(mrr).replace(",00 kr.", " kr.")} pr. md. i faste aftaler</p></div>
        <div className="crm-head-actions">
          <form className="crm-inline"><input name="q" defaultValue={sp.q ?? ""} placeholder="Søg kunde…" aria-label="Søg kunde" /></form>
          <Link href="?ny=1" className="crm-btn crm-btn-primary"><Plus className="size-4" /> Ny kunde</Link>
        </div>
      </header>
      {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}
      {sp.slettet && <p className="admin-notice is-ok" role="status">Kunden er slettet.</p>}
      {error && <p className="admin-notice is-error" role="alert">{error.message}</p>}

      {sp.ny && (
        <form action={createCustomer} className="admin-form">
          <div className="admin-form-title"><h2>Ny kunde</h2><Link href="/admin/kunder" aria-label="Luk">×</Link></div>
          <div className="admin-form-grid">
            <label>Navn *<input name="name" required placeholder="Firma eller person" /></label>
            <label>Firma<input name="company" /></label>
            <label>Kontaktperson<input name="contact_name" /></label>
            <label>Email<input name="email" type="email" /></label>
            <label>Telefon<input name="phone" type="tel" /></label>
            <label>CVR<input name="cvr" /></label>
            <label className="span-2">Adresse<input name="address" /></label>
            <label>Aftale pr. md. (kr. ekskl. moms)<input name="monthly_value" inputMode="decimal" /></label>
            <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Opret kunde</button></div>
          </div>
        </form>
      )}

      <nav className="crm-tabs" aria-label="Filter">
        <Link href="/admin/kunder" aria-current={!sp.vis ? "page" : undefined}>Alle</Link>
        {Object.entries(statusLabels).map(([v, l]) => <Link key={v} href={`?vis=${v}`} aria-current={sp.vis === v ? "page" : undefined}>{l}</Link>)}
      </nav>

      <article className="crm-card crm-card-flush">
        {rows.length ? (
          <table className="crm-table">
            <thead><tr><th>Kunde</th><th>Kontakt</th><th>Steder</th><th className="num">Aftale/md.</th><th className="num">Betalt i alt</th><th className="num">Udestående</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/admin/kunder/${c.id}`} className="crm-name"><span className="crm-avatar-sq">{(c.company || c.name).slice(0, 2).toUpperCase()}</span>{c.company || c.name}</Link></td>
                  <td>{c.contact_name || (c.company ? c.name : "")}<small className="crm-cell-sub">{c.email}</small></td>
                  <td>{locCount.get(c.id) ?? 0}</td>
                  <td className="num crm-mono">{c.monthly_value ? kr(Number(c.monthly_value)) : "–"}</td>
                  <td className="num crm-mono">{revenue.get(c.id) ? kr(revenue.get(c.id)!) : "–"}</td>
                  <td className="num crm-mono">{unpaid.get(c.id) ? <span className="is-warn">{kr(unpaid.get(c.id)!)}</span> : "–"}</td>
                  <td><span className={`crm-pill cust-${c.status}`}>{statusLabels[c.status] ?? c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="crm-empty">Ingen kunder endnu. Opret én – eller gør et vundet lead til kunde fra pipelinen.</p>}
      </article>
    </main>
  )
}
