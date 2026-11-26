import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { kr } from "@/lib/backend/quotes"
import { displayStatus, invoiceNo, invoiceStatusLabels } from "@/lib/backend/invoices"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fakturaer" }

export default async function CustomerInvoices() {
  const p = await customerPortal("/kunde/fakturaer")
  const { data: invoices } = await createAdminClient().from("invoices").select("id, invoice_number, credit_of, status, total, due_date, issue_date, public_token").eq("org_id", p.org.id).neq("status", "draft").in("customer_id", p.ids).order("issue_date", { ascending: false }).limit(60)
  const list = (invoices ?? []).map((i) => ({ ...i, st: displayStatus(i as never) }))
  const unpaid = list.filter((i) => i.st === "sent" || i.st === "overdue")
  const owed = unpaid.reduce((s, i) => s + Number(i.total), 0)
  const year = new Date().getFullYear()
  const paidYear = list.filter((i) => i.st === "paid" && i.issue_date?.startsWith(String(year))).reduce((s, i) => s + Number(i.total), 0)
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Fakturaer</h1><p>Åbn en faktura for at se betalingsoplysninger eller udskrive den.</p></header>
      <div className="pt-kpis">
        <div><small>Til betaling</small><strong>{kr(owed)}</strong><em>{unpaid.length} ubetalt{unpaid.some((i) => i.st === "overdue") ? " · forfalden" : ""}</em></div>
        <div><small>Betalt i {year}</small><strong>{kr(paidYear)}</strong><em>inkl. moms</em></div>
      </div>
      <section className="pt-card">
        <ul className="pt-mini">
          {list.map((i) => (
            <li key={i.id}>
              <a href={`/f/${i.public_token}`}><strong>{invoiceNo(p.org, i)}</strong><small>{new Date(`${i.issue_date}T12:00:00Z`).toLocaleDateString("da-DK")}{i.due_date && (i.st === "sent" || i.st === "overdue") ? ` · forfald ${new Date(`${i.due_date}T12:00:00Z`).toLocaleDateString("da-DK")}` : ""}</small></a>
              <b><span className={`pt-pill i-${i.st}`}>{invoiceStatusLabels[i.st]}</span> {kr(Number(i.total))}</b>
            </li>
          ))}
          {!list.length && <li className="pt-empty">Ingen fakturaer endnu.</li>}
        </ul>
      </section>
    </main>
  )
}
