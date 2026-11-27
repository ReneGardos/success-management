import Link from "next/link"
import { ChevronLeft, ChevronRight, Download, Lock, Settings2 } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { computePayroll, hrs, loadEmployeePay, loadEntries, loadPayrollSettings } from "@/lib/backend/payroll"
import { kr } from "@/lib/backend/quotes"
import { copenhagenToIso, todayLocal } from "@/lib/time"
import { approveEntries } from "../timer/actions"
import { lockPeriod, saveEmployeePay, savePayrollSettings } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Løn" }

const monthStart = (d: string) => `${d.slice(0, 7)}-01`
const addMonths = (d: string, n: number) => { const x = new Date(`${monthStart(d)}T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10) }

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ fra?: string; til?: string; gemt?: string; laast?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/loen")
  const sp = await searchParams
  const valid = (v?: string) => v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const from = valid(sp.fra) ? sp.fra! : monthStart(todayLocal())
  const to = valid(sp.til) ? sp.til! : addMonths(from, 1)
  const [s, pay, entries, { staff }, { data: locked }] = await Promise.all([
    loadPayrollSettings(org.id), loadEmployeePay(org.id), loadEntries(org.id, copenhagenToIso(from, "00:00")!, copenhagenToIso(to, "00:00")!), listStaff(org.id),
    createAdminClient().from("payroll_periods").select("starts_on, ends_on, locked_at").eq("org_id", org.id).order("starts_on", { ascending: false }).limit(12),
  ])
  const done = entries.filter((e) => e.check_out_at)
  const lines = computePayroll(done, s, pay)
  const names = new Map(staff.map((p) => [p.id, p.name]))
  const sum = (k: "hours" | "gross" | "cost" | "kmPay" | "supplements" | "overtime") => lines.reduce((t, l) => t + l[k], 0)
  const unapproved = done.filter((e) => !e.approved_at).length
  const isLocked = (locked ?? []).some((l) => l.starts_on === from && l.ends_on === to)
  const label = from === monthStart(from) && to === addMonths(from, 1) ? new Date(`${from}T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric" }) : `${from} – ${to}`
  const q = (f: string, t: string) => `/admin/loen?fra=${f}&til=${t}`
  const self = q(from, to)
  return (
    <main className="admin-shell crm">
      <header className="crm-head">
        <div><p className="crm-kicker">{org.name}</p><h1>Løn · <span style={{ textTransform: "capitalize" }}>{label}</span></h1><p className="crm-head-sub">Godkendte timer, tillæg, overtid og kørsel – klar til lønsystemet.</p></div>
        <div className="crm-inline">
          <Link href={q(addMonths(from, -1), from)} className="crm-btn" aria-label="Forrige måned"><ChevronLeft className="size-4" /></Link>
          <Link href="/admin/loen" className="crm-btn">Denne måned</Link>
          <Link href={q(to, addMonths(to, 1))} className="crm-btn" aria-label="Næste måned"><ChevronRight className="size-4" /></Link>
          <a href={`/api/admin/loen-csv?fra=${from}&til=${to}`} className="crm-btn"><Download className="size-4" /> Eksport (CSV)</a>
          <form action={lockPeriod}><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /><input type="hidden" name="back" value={self} /><button type="submit" className="crm-btn crm-btn-primary"><Lock className="size-4" /> {isLocked ? "Lås igen" : "Afslut lønperiode"}</button></form>
        </div>
      </header>
      {sp.gemt && <p className="admin-notice is-ok" role="status">Gemt.</p>}
      {sp.laast && <p className="admin-notice is-ok" role="status">Lønperioden er afsluttet og gemt.</p>}
      {unapproved > 0 && <form action={approveEntries} className="admin-notice"><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} />{unapproved} registrering{unapproved === 1 ? "" : "er"} er ikke godkendt. <Link href={`/admin/timer?periode=maaned&uge=${from}`}>Gennemse timer</Link> eller <button type="submit" className="crm-btn">✓ Godkend alle</button></form>}
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Timer</span></div><div className="crm-kpi-row"><strong>{hrs(sum("hours"))}</strong></div><div className="crm-kpi-foot"><small>{hrs(sum("overtime"))} t overtid</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Bruttoløn</span></div><div className="crm-kpi-row"><strong>{kr(sum("gross"))}</strong></div><div className="crm-kpi-foot"><small>heraf tillæg {kr(sum("supplements"))}</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Kørsel</span></div><div className="crm-kpi-row"><strong>{kr(sum("kmPay"))}</strong></div><div className="crm-kpi-foot"><small>{s.km_rate.toLocaleString("da-DK")} kr./km</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Samlet lønomkostning</span></div><div className="crm-kpi-row"><strong>{kr(sum("cost"))}</strong></div><div className="crm-kpi-foot"><small>inkl. {s.labor_overhead_pct} % pension, ferie m.m.</small></div></div>
      </section>
      <article className="crm-card crm-card-flush">
        <header className="crm-card-head crm-pad"><div><h2>Pr. medarbejder</h2><p>Sats, ugenorm og lønnummer kan rettes direkte i rækken.</p></div></header>
        <div className="crm-scroll">
          <table className="crm-table pay-table">
            <thead><tr><th>Medarbejder</th><th className="crm-right">Timer</th><th className="crm-right">Aften</th><th className="crm-right">Weekend</th><th className="crm-right">Overtid</th><th className="crm-right">Km</th><th className="crm-right">Bruttoløn</th><th>Sats · norm · lønnr.</th></tr></thead>
            <tbody>
              {staff.map((p) => {
                const l = lines.find((x) => x.employee_id === p.id)
                const ep = pay.get(p.id)
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong>{l?.unapproved ? <div className="crm-muted">{l.unapproved} ikke godkendt</div> : null}</td>
                    <td className="crm-right">{l ? hrs(l.hours) : "–"}</td>
                    <td className="crm-right">{l?.evening ? hrs(l.evening) : "–"}</td>
                    <td className="crm-right">{l?.weekend ? hrs(l.weekend) : "–"}</td>
                    <td className="crm-right">{l?.overtime ? <span className="is-warn">{hrs(l.overtime)}</span> : "–"}</td>
                    <td className="crm-right">{l?.km ? Math.round(l.km) : "–"}</td>
                    <td className="crm-right"><strong>{l ? kr(l.gross) : "–"}</strong></td>
                    <td>
                      <form action={saveEmployeePay} className="pay-inline">
                        <input type="hidden" name="employee_id" value={p.id} />
                        <input name="hourly_wage" inputMode="decimal" placeholder={String(s.default_wage)} defaultValue={ep?.hourly_wage ?? ""} aria-label="Timeløn" title="Timeløn (kr.)" />
                        <input name="weekly_hours" inputMode="decimal" placeholder={String(s.overtime_after_hours)} defaultValue={ep?.weekly_hours ?? ""} aria-label="Timer pr. uge" title="Normtimer pr. uge" />
                        <input name="payroll_no" placeholder="Lønnr." defaultValue={ep?.payroll_no ?? ""} aria-label="Lønnummer" />
                        <button type="submit" className="crm-btn">Gem</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </article>
      <div className="crm-pairs">
        <form action={savePayrollSettings} className="crm-card pay-settings">
          <input type="hidden" name="back" value={self} />
          <header className="crm-card-head"><div><h2><Settings2 className="size-4 inline" /> Lønregler</h2><p>Gælder for hele virksomheden. Satsen kan overskrives pr. medarbejder.</p></div></header>
          <div className="pay-grid">
            <label>Standard timeløn<input name="default_wage" inputMode="decimal" defaultValue={s.default_wage} /> kr.</label>
            <label>Aftentillæg<input name="evening_supplement" inputMode="decimal" defaultValue={s.evening_supplement} /> kr./t</label>
            <label>Aften fra kl.<input name="evening_start" type="number" min={12} max={23} defaultValue={s.evening_start} /> til <input name="evening_end" type="number" min={0} max={12} defaultValue={s.evening_end} /></label>
            <label>Weekendtillæg<input name="weekend_supplement" inputMode="decimal" defaultValue={s.weekend_supplement} /> kr./t</label>
            <label>Overtid efter<input name="overtime_after_hours" inputMode="decimal" defaultValue={s.overtime_after_hours} /> t/uge</label>
            <label>Overtidstillæg<input name="overtime_pct" inputMode="decimal" defaultValue={s.overtime_pct} /> %</label>
            <label>Kørselssats<input name="km_rate" inputMode="decimal" defaultValue={s.km_rate} /> kr./km</label>
            <label>Lønomkostninger oveni<input name="labor_overhead_pct" inputMode="decimal" defaultValue={s.labor_overhead_pct} /> %</label>
          </div>
          <div className="au-save"><button type="submit" className="crm-btn crm-btn-primary">Gem lønregler</button></div>
        </form>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Afsluttede perioder</h2></div></header>
          <ul className="au-log">
            {(locked ?? []).map((l) => <li key={l.starts_on + l.ends_on}><Lock className="size-4" /><span><Link href={q(l.starts_on, l.ends_on)}>{l.starts_on} – {l.ends_on}</Link></span><time>{new Date(l.locked_at).toLocaleDateString("da-DK")}</time></li>)}
            {!locked?.length && <li className="crm-muted">Ingen endnu.</li>}
          </ul>
        </article>
      </div>
    </main>
  )
}
