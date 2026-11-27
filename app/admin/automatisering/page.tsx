import Link from "next/link"
import { Bell, CalendarClock, FileClock, Mail, Play, Receipt, Repeat, Zap } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadAutomation } from "@/lib/backend/automation"
import { kr, splitTotals, type QuoteLine } from "@/lib/backend/quotes"
import { addDays, todayLocal } from "@/lib/time"
import { runNow, saveAutomation, toggleQuoteAuto } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Automatisering" }

const weekdays = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"]
const kindIcon: Record<string, typeof Zap> = { invoice: Receipt, reminder: FileClock, followup: Mail, nudge: Bell, digest: CalendarClock, error: Zap }

export default async function AutomationPage({ searchParams }: { searchParams: Promise<{ gemt?: string; koert?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/automatisering")
  const sp = await searchParams
  const db = createAdminClient()
  const s = await loadAutomation(org.id)
  const today = todayLocal()
  const [{ data: agreements }, { data: overdue }, { data: waiting }, { data: runs }] = await Promise.all([
    db.from("quotes").select("id, quote_number, title, recipient_company, recipient_name, billing, vat_rate, auto_invoice").eq("org_id", org.id).eq("status", "accepted").neq("billing", "one_time").order("accepted_at", { ascending: false }).limit(100),
    db.from("invoices").select("id, total").eq("org_id", org.id).eq("status", "sent").is("credit_of", null).lte("due_date", addDays(today, -s.reminder_after_days)).lt("reminder_count", s.reminder_max),
    db.from("quotes").select("id").eq("org_id", org.id).eq("status", "sent").is("followup_sent_at", null).lte("sent_at", new Date(Date.now() - s.followup_after_days * 86400000).toISOString()),
    db.from("automation_runs").select("id, kind, summary, ref_id, created_at").eq("org_id", org.id).order("created_at", { ascending: false }).limit(40),
  ])
  const ids = (agreements ?? []).map((q) => q.id)
  const { data: lines } = ids.length ? await db.from("quote_line_items").select("quote_id, description, quantity, unit, unit_price, position, recurring").eq("org_id", org.id).in("quote_id", ids) : { data: [] }
  const monthlyOf = (q: NonNullable<typeof agreements>[number]) => splitTotals(((lines ?? []).filter((l) => l.quote_id === q.id).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) }))) as QuoteLine[], Number(q.vat_rate ?? 25), q.billing).monthly.subtotal
  const mrr = (agreements ?? []).filter((q) => q.auto_invoice).reduce((t, q) => t + monthlyOf(q), 0)
  const day = (n: number) => <select name="invoice_day" defaultValue={n}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}.</option>)}</select>
  return (
    <main className="admin-shell crm">
      <header className="crm-head">
        <div><p className="crm-kicker">{org.name}</p><h1>Automatisering</h1><p className="crm-head-sub">Lad systemet klare det faste: fakturering, rykkere, opfølgning og påmindelser. Kører hver morgen kl. ca. 6–7.</p></div>
        <div className="crm-inline">
          <form action={runNow}><button className="crm-btn crm-btn-primary" type="submit"><Play className="size-4" /> Kør nu</button></form>
          <form action={runNow}><input type="hidden" name="digest" value="1" /><button className="crm-btn" type="submit"><Mail className="size-4" /> Send ugens tal nu</button></form>
        </div>
      </header>
      {sp.gemt && <p className="admin-notice is-ok" role="status">Gemt.</p>}
      {sp.koert && <p className="admin-notice is-ok" role="status">Kørt. {sp.koert === "0" ? "Der var intet at gøre lige nu." : `${sp.koert} handling${sp.koert === "1" ? "" : "er"} udført – se loggen herunder.`}</p>}
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Faste aftaler</span></div><div className="crm-kpi-row"><strong>{(agreements ?? []).length}</strong></div><div className="crm-kpi-foot"><small>{kr(mrr)} pr. md. faktureres automatisk</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Klar til rykker</span></div><div className="crm-kpi-row"><strong className={(overdue ?? []).length ? "is-warn" : ""}>{(overdue ?? []).length}</strong></div><div className="crm-kpi-foot"><small>{kr((overdue ?? []).reduce((t, i) => t + Number(i.total), 0))}</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Tilbud uden svar</span></div><div className="crm-kpi-row"><strong>{(waiting ?? []).length}</strong></div><div className="crm-kpi-foot"><small>over {s.followup_after_days} dage</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Handlinger</span></div><div className="crm-kpi-row"><strong>{(runs ?? []).length}</strong></div><div className="crm-kpi-foot"><small>seneste i loggen</small></div></div>
      </section>

      <form action={saveAutomation} className="au-grid">
        <article className="crm-card au-card">
          <header><Repeat className="size-5" /><div><h2>Fakturér faste aftaler</h2><p>Accepterede tilbud med faste månedlige linjer faktureres automatisk.</p></div><label className="au-switch"><input type="checkbox" name="auto_invoice" defaultChecked={s.auto_invoice} /><span /></label></header>
          <div className="au-fields"><label>Fakturadag i måneden {day(s.invoice_day)}</label><label className="au-check"><input type="checkbox" name="invoice_send" defaultChecked={s.invoice_send} /> Send fakturaen direkte (ellers oprettes en kladde, du godkender)</label></div>
        </article>
        <article className="crm-card au-card">
          <header><FileClock className="size-5" /><div><h2>Automatiske rykkere</h2><p>Venlige påmindelser om forfaldne fakturaer.</p></div><label className="au-switch"><input type="checkbox" name="auto_reminders" defaultChecked={s.auto_reminders} /><span /></label></header>
          <div className="au-fields au-3"><label>Første efter<input type="number" name="reminder_after_days" min={1} max={60} defaultValue={s.reminder_after_days} /> dage</label><label>Gentag hver<input type="number" name="reminder_repeat_days" min={3} max={60} defaultValue={s.reminder_repeat_days} /> dage</label><label>Højst<input type="number" name="reminder_max" min={1} max={5} defaultValue={s.reminder_max} /> rykkere</label></div>
        </article>
        <article className="crm-card au-card">
          <header><Mail className="size-5" /><div><h2>Opfølgning på tilbud</h2><p>Kunden får en kort mail, hvis de ikke har svaret.</p></div><label className="au-switch"><input type="checkbox" name="quote_followup" defaultChecked={s.quote_followup} /><span /></label></header>
          <div className="au-fields"><label>Efter<input type="number" name="followup_after_days" min={1} max={30} defaultValue={s.followup_after_days} /> dage uden svar</label></div>
        </article>
        <article className="crm-card au-card">
          <header><CalendarClock className="size-5" /><div><h2>Ugens tal</h2><p>Mail og notifikation til kontoret med besøg, timer, omsætning og tilfredshed.</p></div><label className="au-switch"><input type="checkbox" name="weekly_digest" defaultChecked={s.weekly_digest} /><span /></label></header>
          <div className="au-fields"><label>Hver<select name="digest_weekday" defaultValue={s.digest_weekday}>{weekdays.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</select></label></div>
        </article>
        <article className="crm-card au-card au-wide">
          <header><Bell className="size-5" /><div><h2>Påmindelser på telefonen</h2><p>Push og notifikationer – ingen mails.</p></div></header>
          <div className="au-fields au-3">
            <label className="au-check"><input type="checkbox" name="employee_morning" defaultChecked={s.employee_morning} /> Morgenbesked til medarbejdere om dagens vagter</label>
            <label className="au-check"><input type="checkbox" name="customer_visit_reminder" defaultChecked={s.customer_visit_reminder} /> Kunder får besked dagen før et besøg</label>
            <label className="au-check"><input type="checkbox" name="report_reminder" defaultChecked={s.report_reminder} /> Påmind om manglende rapporter</label>
          </div>
        </article>
        <div className="au-save"><button type="submit" className="crm-btn crm-btn-primary">Gem automatisering</button></div>
      </form>

      <div className="crm-pairs">
        <article className="crm-card crm-card-flush">
          <header className="crm-card-head crm-pad"><div><h2>Faste aftaler</h2><p>Slå automatisk fakturering fra for en enkelt aftale.</p></div></header>
          {(agreements ?? []).length ? <table className="crm-table"><thead><tr><th>Kunde</th><th className="crm-right">Pr. md.</th><th /></tr></thead><tbody>
            {(agreements ?? []).map((q) => <tr key={q.id}><td><Link href={`/admin/tilbud/${q.id}`}>{q.recipient_company || q.recipient_name}</Link><div className="crm-muted">#{q.quote_number} · {q.title}</div></td><td className="crm-right">{kr(monthlyOf(q))}</td><td className="crm-right"><form action={toggleQuoteAuto}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="on" value={q.auto_invoice ? "0" : "1"} /><button className={`crm-pill ${q.auto_invoice ? "inv-paid" : "inv-draft"}`} type="submit">{q.auto_invoice ? "Automatisk" : "Manuelt"}</button></form></td></tr>)}
          </tbody></table> : <p className="crm-empty">Ingen accepterede faste aftaler endnu.</p>}
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Log</h2><p>Hvad systemet har gjort.</p></div></header>
          <ul className="au-log">
            {(runs ?? []).map((r) => { const Icon = kindIcon[r.kind] ?? Zap; return <li key={r.id} className={r.kind === "error" ? "is-err" : ""}><Icon className="size-4" /><span>{r.ref_id && (r.kind === "invoice" || r.kind === "reminder") ? <Link href={`/admin/fakturaer/${r.ref_id}`}>{r.summary}</Link> : r.ref_id && r.kind === "followup" ? <Link href={`/admin/tilbud/${r.ref_id}`}>{r.summary}</Link> : r.summary}</span><time>{new Date(r.created_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></li> })}
            {!runs?.length && <li className="crm-muted">Intet endnu. Slå noget til og tryk "Kør nu".</li>}
          </ul>
        </article>
      </div>
    </main>
  )
}
