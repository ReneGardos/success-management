import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileSignature, Mail, Phone, Trash2, UserCheck } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { createQuote } from "../../tilbud/actions"
import { convertLead, deleteLead, saveLead } from "../actions"

export const dynamic = "force-dynamic"

const statusLabels: Record<string, string> = { new: "Ny", contacted: "Kontaktet", qualified: "Kvalificeret", quoted: "Tilbud sendt", won: "Vundet", lost: "Tabt" }

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gemt?: string; fejl?: string }> }) {
  const { id } = await params
  const { org } = await requireRolePage(["admin"], `/admin/leads/${id}`)
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = createAdminClient()
  const { data: lead } = await db.from("leads").select("*").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!lead) notFound()
  const safeEmail = /^[^,()\s"]+$/.test(String(lead.email)) ? String(lead.email) : null
  const [{ data: quotes }, { data: mails }] = await Promise.all([
    db.from("quotes").select("id, quote_number, status, total, created_at").eq("org_id", org.id).or(safeEmail ? `lead_id.eq.${id},recipient_email.eq.${safeEmail}` : `lead_id.eq.${id}`).order("created_at", { ascending: false }).limit(20),
    lead.contact_request_id ? db.from("email_messages").select("id, direction, subject, created_at").eq("org_id", org.id).eq("contact_request_id", lead.contact_request_id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
  ])
  const display = lead.company || String(lead.name).replace(/\s*\([^)]+\)$/, "")

  return (
    <main className="admin-shell crm">
      <Link href="/admin/leads" className="crm-back"><ArrowLeft className="size-4" /> Pipeline</Link>
      <header className="crm-head">
        <div><p className="crm-kicker">Lead · {statusLabels[lead.status] ?? lead.status}</p><h1>{display}</h1><p className="crm-head-sub"><a href={`mailto:${lead.email}`}>{lead.email}</a>{lead.phone ? <> · <a href={`tel:${String(lead.phone).replace(/\s+/g, "")}`}>{lead.phone}</a></> : null} · oprettet {new Date(lead.created_at).toLocaleDateString("da-DK")}</p></div>
        <div className="crm-head-actions">
          <a className="crm-btn" href={`mailto:${lead.email}`}><Mail className="size-4" /> Mail</a>
          {lead.phone && <a className="crm-btn" href={`tel:${String(lead.phone).replace(/\s+/g, "")}`}><Phone className="size-4" /> Ring</a>}
          {lead.contact_request_id && <Link className="crm-btn" href={`/admin/mail/${lead.contact_request_id}`}>Se tråd</Link>}
          <form action={createQuote}>{lead.contact_request_id && <input type="hidden" name="contactRequestId" value={lead.contact_request_id} />}<button className="crm-btn" type="submit"><FileSignature className="size-4" /> Lav tilbud</button></form>
          <form action={convertLead}><input type="hidden" name="id" value={lead.id} /><button className="crm-btn crm-btn-primary" type="submit"><UserCheck className="size-4" /> {lead.customer_id ? "Åbn kunde" : "Gør til kunde"}</button></form>
        </div>
      </header>
      {sp.gemt && <p className="admin-notice is-ok" role="status">Gemt.</p>}
      {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}

      <div className="crm-grid-3">
        <form action={saveLead} className="admin-form crm-span-2">
          <input type="hidden" name="id" value={lead.id} />
          <h2>Oplysninger</h2>
          <div className="admin-form-grid">
            <label>Navn<input name="name" defaultValue={lead.name} required /></label>
            <label>Firma<input name="company" defaultValue={lead.company ?? ""} /></label>
            <label>Email<input name="email" type="email" defaultValue={lead.email} required /></label>
            <label>Telefon<input name="phone" defaultValue={lead.phone ?? ""} /></label>
            <label>Status<select name="status" defaultValue={lead.status}>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Forventet værdi pr. md. (kr.)<input name="value" inputMode="decimal" defaultValue={lead.value ?? ""} /></label>
            <label>Næste opfølgning<input name="next_action_at" type="date" defaultValue={lead.next_action_at ?? ""} /></label>
            <span />
            <label className="span-2">Noter<textarea name="notes" rows={5} defaultValue={lead.notes ?? ""} placeholder="Hvad blev aftalt, hvem er beslutningstager, størrelse på lokaler…" /></label>
            <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem</button></div>
          </div>
          {lead.message && <><h2>Første henvendelse</h2><p className="crm-quote">{lead.message}</p></>}
        </form>
        <aside className="grid gap-4 content-start">
          <article className="crm-card">
            <header className="crm-card-head"><div><h2>Tilbud</h2></div></header>
            {quotes?.length ? <ul className="crm-list">{quotes.map((q) => <li key={q.id}><Link href={`/admin/tilbud/${q.id}`}>#{q.quote_number}</Link><span className={`crm-pill quote-${q.status}`}>{q.status}</span></li>)}</ul> : <p className="crm-empty">Ingen tilbud endnu.</p>}
          </article>
          <article className="crm-card">
            <header className="crm-card-head"><div><h2>Mails</h2></div></header>
            {mails?.length ? <ul className="crm-list">{mails.map((m) => <li key={m.id}><span>{m.direction === "inbound" ? "↙" : "↗"} {m.subject}</span><small>{new Date(m.created_at).toLocaleDateString("da-DK")}</small></li>)}</ul> : <p className="crm-empty">Ingen mails endnu.</p>}
          </article>
          <form action={deleteLead} className="admin-inline-form admin-delete-row"><input type="hidden" name="id" value={lead.id} /><button type="submit"><Trash2 className="size-4 inline" /> Slet lead</button></form>
        </aside>
      </div>
    </main>
  )
}
