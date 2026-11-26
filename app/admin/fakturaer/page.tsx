import Link from "next/link"
import { FilePlus2 } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr } from "@/lib/backend/quotes"
import { displayStatus, invoiceNo, invoiceStatusLabels } from "@/lib/backend/invoices"
import { BarChart } from "@/components/charts"
import { createInvoice } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fakturaer" }

type Row = { id: string; invoice_number: number | null; credit_of: string | null; status: string; title: string | null; recipient_company: string | null; recipient_name: string | null; total: number; issue_date: string; due_date: string | null; paid_at: string | null; sent_at: string | null }

const filters = [["alle", "Alle"], ["draft", "Kladder"], ["sent", "Ubetalte"], ["overdue", "Forfaldne"], ["paid", "Betalte"]] as const

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ vis?: string; fejl?: string; slettet?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/fakturaer")
  const { vis = "alle", fejl, slettet } = await searchParams
  const db = createAdminClient()
  const [{ data, error }, { data: customers }] = await Promise.all([
    db.from("invoices").select("id, invoice_number, credit_of, status, title, recipient_company, recipient_name, total, issue_date, due_date, paid_at, sent_at").eq("org_id", org.id).order("created_at", { ascending: false }).limit(1000),
    db.from("customers").select("id, name, company").eq("org_id", org.id).order("name").limit(500),
  ])
  const all = ((data ?? []) as Row[]).map((r) => ({ ...r, total: Number(r.total), shown: displayStatus(r) }))
  const rows = vis === "alle" ? all : all.filter((r) => r.shown === vis || (vis === "sent" && r.shown === "overdue"))
  const outstanding = all.filter((r) => r.status === "sent").reduce((s, r) => s + r.total, 0)
  const overdue = all.filter((r) => r.shown === "overdue")
  const overdueSum = overdue.reduce((s, r) => s + r.total, 0)

  // Invoiced per month (last 6 months, excl. drafts), net of credit notes.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - (5 - i))
    return d.toISOString().slice(0, 7)
  })
  const perMonth = months.map((m) => all.filter((r) => r.status !== "draft" && r.status !== "void" && r.issue_date.startsWith(m)).reduce((s, r) => s + r.total, 0))
  const paidThisMonth = all.filter((r) => r.paid_at?.startsWith(months[5])).reduce((s, r) => s + r.total, 0)

  return (
    <main className="admin-shell crm">
      <header className="crm-head">
        <div><p className="crm-kicker">{org.name}</p><h1>Fakturaer</h1><p className="crm-head-sub">Opret, send og følg betalinger. Fakturaer kan også laves direkte fra et accepteret tilbud.</p></div>
        <form action={createInvoice} className="crm-head-actions">
          {(customers?.length ?? 0) > 0 && (
            <select name="customer_id" aria-label="Kunde" defaultValue="">
              <option value="">Uden kunde</option>
              {customers!.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
            </select>
          )}
          <button type="submit" className="crm-btn crm-btn-primary"><FilePlus2 className="size-4" /> Ny faktura</button>
        </form>
      </header>

      {fejl && <p className="admin-notice is-error" role="alert">{fejl}</p>}
      {slettet && <p className="admin-notice is-ok" role="status">Kladden er slettet.</p>}
      {error && <p className="admin-notice is-error" role="alert">{error.message}</p>}

      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Udestående</span></div><div className="crm-kpi-row"><strong>{kr(outstanding).replace(",00 kr.", " kr.")}</strong></div><div className="crm-kpi-foot"><small>{all.filter((r) => r.status === "sent").length} ubetalte fakturaer</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Forfaldent</span></div><div className="crm-kpi-row"><strong className={overdue.length ? "is-warn" : ""}>{kr(overdueSum).replace(",00 kr.", " kr.")}</strong></div><div className="crm-kpi-foot"><small>{overdue.length} forfaldne</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Betalt denne måned</span></div><div className="crm-kpi-row"><strong>{kr(paidThisMonth).replace(",00 kr.", " kr.")}</strong></div><div className="crm-kpi-foot"><small>inkl. moms</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Faktureret · 6 mdr.</span></div><div className="crm-kpi-row"><strong>{kr(perMonth.reduce((a, b) => a + b, 0)).replace(",00 kr.", " kr.")}</strong></div><div className="crm-kpi-foot"><small>inkl. moms, netto efter kreditnotaer</small></div></div>
      </section>

      <article className="crm-card">
        <header className="crm-card-head"><div><h2>Faktureret pr. måned</h2><p>Inkl. moms</p></div></header>
        <BarChart values={perMonth.map((v) => Math.round(v))} labels={months.map((m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("da-DK", { month: "short" }))} color={org.color_primary} unit=" kr." />
      </article>

      <nav className="crm-tabs" aria-label="Filter">
        {filters.map(([v, l]) => <Link key={v} href={`?vis=${v}`} aria-current={vis === v ? "page" : undefined}>{l}<span>{v === "alle" ? all.length : all.filter((r) => r.shown === v || (v === "sent" && r.shown === "overdue")).length}</span></Link>)}
      </nav>

      <article className="crm-card crm-card-flush">
        {rows.length ? (
          <table className="crm-table">
            <thead><tr><th>Nr.</th><th>Kunde</th><th>Dato</th><th>Forfald</th><th className="num">Beløb</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="crm-mono"><Link href={`/admin/fakturaer/${r.id}`}>{r.credit_of ? "KN " : ""}{invoiceNo(org, r)}</Link></td>
                  <td><Link href={`/admin/fakturaer/${r.id}`}>{r.recipient_company || r.recipient_name || "Uden kunde"}</Link><small className="crm-cell-sub">{r.title}</small></td>
                  <td>{new Date(`${r.issue_date}T12:00:00Z`).toLocaleDateString("da-DK")}</td>
                  <td>{r.due_date ? new Date(`${r.due_date}T12:00:00Z`).toLocaleDateString("da-DK") : "–"}</td>
                  <td className="num crm-mono">{kr(r.total)}</td>
                  <td><span className={`crm-pill inv-${r.shown}`}>{invoiceStatusLabels[r.shown] ?? r.shown}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="crm-empty">Ingen fakturaer her endnu.</p>}
      </article>
    </main>
  )
}
