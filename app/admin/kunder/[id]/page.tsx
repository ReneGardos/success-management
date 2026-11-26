import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FilePlus2, Mail, MapPin, Phone, Receipt, Trash2 } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr } from "@/lib/backend/quotes"
import { displayStatus, invoiceNo, invoiceStatusLabels } from "@/lib/backend/invoices"
import { createInvoice } from "../../fakturaer/actions"
import { deleteCustomer, linkLocation, saveCustomer } from "../actions"

export const dynamic = "force-dynamic"

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gemt?: string; fejl?: string; fra?: string }> }) {
  const { id } = await params
  const { org } = await requireRolePage(["admin"], `/admin/kunder/${id}`)
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = createAdminClient()
  const { data: c } = await db.from("customers").select("*").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!c) notFound()
  const safeEmail = c.email && /^[^,()\s"]+$/.test(c.email) ? c.email : null
  const [{ data: invoices }, { data: quotes }, { data: locations }, { data: freeLocations }] = await Promise.all([
    db.from("invoices").select("id, invoice_number, credit_of, status, total, issue_date, due_date").eq("org_id", org.id).eq("customer_id", id).order("issue_date", { ascending: false }).limit(100),
    db.from("quotes").select("id, quote_number, status, total, billing, created_at").eq("org_id", org.id).or(safeEmail ? `customer_id.eq.${id},recipient_email.eq.${safeEmail}` : `customer_id.eq.${id}`).order("created_at", { ascending: false }).limit(50),
    db.from("locations").select("id, name, address").eq("org_id", org.id).eq("customer_id", id).order("name"),
    db.from("locations").select("id, name").eq("org_id", org.id).is("customer_id", null).eq("active", true).order("name").limit(200),
  ])
  const locIds = (locations ?? []).map((l) => l.id)
  const { data: jobs } = locIds.length
    ? await db.from("jobs").select("id, title, scheduled_start, status").eq("org_id", org.id).in("location_id", locIds).gte("scheduled_start", new Date().toISOString()).order("scheduled_start").limit(8)
    : { data: [] }
  const paid = (invoices ?? []).filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total), 0)
  const open = (invoices ?? []).filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total), 0)
  const title = c.company || c.name

  return (
    <main className="admin-shell crm">
      <Link href="/admin/kunder" className="crm-back"><ArrowLeft className="size-4" /> Kunder</Link>
      <header className="crm-head">
        <div className="crm-head-ident">
          <span className="crm-avatar-lg">{title.slice(0, 2).toUpperCase()}</span>
          <div><p className="crm-kicker">Kunde</p><h1>{title}</h1><p className="crm-head-sub">{[c.contact_name, c.email, c.phone, c.cvr ? `CVR ${c.cvr}` : null].filter(Boolean).join(" · ")}</p></div>
        </div>
        <div className="crm-head-actions">
          {c.email && <a className="crm-btn" href={`mailto:${c.email}`}><Mail className="size-4" /> Mail</a>}
          {c.phone && <a className="crm-btn" href={`tel:${String(c.phone).replace(/\s+/g, "")}`}><Phone className="size-4" /> Ring</a>}
          <form action={createInvoice}><input type="hidden" name="customer_id" value={c.id} /><button className="crm-btn crm-btn-primary" type="submit"><Receipt className="size-4" /> Ny faktura</button></form>
        </div>
      </header>
      {sp.fra && <p className="admin-notice is-ok" role="status">Leadet er gjort til kunde.</p>}
      {sp.gemt && <p className="admin-notice is-ok" role="status">Gemt.</p>}
      {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}

      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Aftale pr. md.</span></div><div className="crm-kpi-row"><strong>{c.monthly_value ? kr(Number(c.monthly_value)).replace(",00 kr.", " kr.") : "–"}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Betalt i alt</span></div><div className="crm-kpi-row"><strong>{kr(paid).replace(",00 kr.", " kr.")}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Udestående</span></div><div className="crm-kpi-row"><strong className={open ? "is-warn" : ""}>{kr(open).replace(",00 kr.", " kr.")}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Steder</span></div><div className="crm-kpi-row"><strong>{locations?.length ?? 0}</strong></div></div>
      </section>

      <div className="crm-grid-3">
        <div className="crm-span-2 grid gap-4 content-start">
          <article className="crm-card crm-card-flush">
            <header className="crm-card-head crm-pad"><div><h2>Fakturaer</h2></div><form action={createInvoice}><input type="hidden" name="customer_id" value={c.id} /><button className="crm-link" type="submit"><FilePlus2 className="size-3" /> Ny</button></form></header>
            {invoices?.length ? (
              <table className="crm-table"><tbody>{invoices.map((i) => { const st = displayStatus(i as never); return <tr key={i.id}><td className="crm-mono"><Link href={`/admin/fakturaer/${i.id}`}>{invoiceNo(org, i)}</Link></td><td>{new Date(`${i.issue_date}T12:00:00Z`).toLocaleDateString("da-DK")}</td><td className="num crm-mono">{kr(Number(i.total))}</td><td><span className={`crm-pill inv-${st}`}>{invoiceStatusLabels[st]}</span></td></tr> })}</tbody></table>
            ) : <p className="crm-empty">Ingen fakturaer endnu.</p>}
          </article>
          <article className="crm-card crm-card-flush">
            <header className="crm-card-head crm-pad"><div><h2>Tilbud</h2></div></header>
            {quotes?.length ? (
              <table className="crm-table"><tbody>{quotes.map((q) => <tr key={q.id}><td className="crm-mono"><Link href={`/admin/tilbud/${q.id}`}>#{q.quote_number}</Link></td><td>{new Date(q.created_at).toLocaleDateString("da-DK")}</td><td className="num crm-mono">{kr(Number(q.total ?? 0))}{q.billing === "one_time" ? "" : "/md."}</td><td><span className={`crm-pill quote-${q.status}`}>{q.status}</span></td></tr>)}</tbody></table>
            ) : <p className="crm-empty">Ingen tilbud.</p>}
          </article>
          <form action={saveCustomer} className="admin-form">
            <input type="hidden" name="id" value={c.id} />
            <h2>Oplysninger</h2>
            <div className="admin-form-grid">
              <label>Navn *<input name="name" defaultValue={c.name ?? ""} required /></label>
              <label>Firma<input name="company" defaultValue={c.company ?? ""} /></label>
              <label>Kontaktperson<input name="contact_name" defaultValue={c.contact_name ?? ""} /></label>
              <label>Email<input name="email" type="email" defaultValue={c.email ?? ""} /></label>
              <label>Telefon<input name="phone" defaultValue={c.phone ?? ""} /></label>
              <label>CVR<input name="cvr" defaultValue={c.cvr ?? ""} /></label>
              <label className="span-2">Adresse<input name="address" defaultValue={c.address ?? ""} /></label>
              <label>Aftale pr. md. (kr. ekskl. moms)<input name="monthly_value" inputMode="decimal" defaultValue={c.monthly_value ?? ""} /></label>
              <label>Status<select name="status" defaultValue={c.status}><option value="active">Aktiv</option><option value="paused">Pause</option><option value="former">Tidligere</option></select></label>
              <label className="span-2">Noter<textarea name="notes" rows={4} defaultValue={c.notes ?? ""} /></label>
              <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem</button></div>
            </div>
          </form>
        </div>
        <aside className="grid gap-4 content-start">
          <article className="crm-card">
            <header className="crm-card-head"><div><h2>Steder</h2></div><Link href="/admin/steder" className="crm-link">Alle</Link></header>
            {locations?.length ? <ul className="crm-list">{locations.map((l) => <li key={l.id}><span><MapPin className="size-3 inline" /> {l.name}</span><small>{l.address}</small></li>)}</ul> : <p className="crm-empty">Ingen steder tilknyttet.</p>}
            {(freeLocations?.length ?? 0) > 0 && (
              <form action={linkLocation} className="crm-inline" style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={c.id} />
                <select name="location_id" aria-label="Tilknyt sted" defaultValue="">{[<option key="" value="">Tilknyt sted…</option>, ...freeLocations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)]}</select>
                <button type="submit" className="crm-btn">Tilknyt</button>
              </form>
            )}
          </article>
          <article className="crm-card">
            <header className="crm-card-head"><div><h2>Kommende vagter</h2></div></header>
            {jobs?.length ? <ul className="crm-list">{jobs.map((j) => <li key={j.id}><Link href={`/admin/vagtplan?vagt=${j.id}&dato=${String(j.scheduled_start).slice(0, 10)}`}>{j.title ?? "Vagt"}</Link><small>{new Date(j.scheduled_start!).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" })}</small></li>)}</ul> : <p className="crm-empty">Ingen planlagte vagter.</p>}
          </article>
          <form action={deleteCustomer} className="admin-inline-form admin-delete-row"><input type="hidden" name="id" value={c.id} /><button type="submit"><Trash2 className="size-4 inline" /> Slet kunde</button></form>
        </aside>
      </div>
    </main>
  )
}
