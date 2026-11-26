import Link from "next/link"
import { Check, X } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { todayLocal } from "@/lib/time"
import { decideAbsence } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fravær" }

const kinds: Record<string, string> = { vacation: "Ferie / fri", sick: "Sygdom", child_sick: "Barns sygedag", other: "Andet" }
const statusLabel: Record<string, string> = { pending: "Afventer", approved: "Godkendt", declined: "Afvist" }
const d = (x: string) => new Date(`${x}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" })
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000) + 1

export default async function AbsencePage() {
  const { org } = await requireRolePage(["admin"], "/admin/fravaer")
  const db = createAdminClient()
  const today = todayLocal()
  const yearStart = `${today.slice(0, 4)}-01-01`
  const [{ data: rows }, { staff }] = await Promise.all([
    db.from("employee_absences").select("id, employee_id, kind, starts_on, ends_on, note, status, created_at").eq("org_id", org.id).gte("ends_on", yearStart).order("starts_on", { ascending: false }).limit(300),
    listStaff(org.id),
  ])
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const all = rows ?? []
  const pending = all.filter((a) => a.status === "pending")
  const current = all.filter((a) => a.status === "approved" && a.starts_on <= today && a.ends_on >= today)
  const upcoming = all.filter((a) => a.status === "approved" && a.starts_on > today).reverse()
  const history = all.filter((a) => a.status !== "pending" && a.ends_on < today)

  // Shifts that collide with pending or upcoming absences.
  const open = [...pending, ...upcoming, ...current]
  const { data: assigned } = open.length
    ? await db.from("job_assignments").select("employee_id, job:jobs(id, scheduled_start, status)").eq("org_id", org.id).in("employee_id", [...new Set(open.map((a) => a.employee_id))])
    : { data: [] }
  const clash = (a: (typeof all)[number]) => (assigned ?? []).filter((r) => {
    const j = r.job as unknown as { scheduled_start: string | null; status: string } | null
    if (r.employee_id !== a.employee_id || !j?.scheduled_start || j.status === "cancelled") return false
    const day = new Date(j.scheduled_start).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
    return day >= a.starts_on && day <= a.ends_on
  }).length

  // Sick days and holiday days used per person this year.
  const totals = new Map<string, { sick: number; off: number }>()
  for (const a of all) {
    if (a.status !== "approved") continue
    const t = totals.get(a.employee_id) ?? { sick: 0, off: 0 }
    const n = days(a.starts_on < yearStart ? yearStart : a.starts_on, a.ends_on)
    if (a.kind === "sick" || a.kind === "child_sick") t.sick += n; else t.off += n
    totals.set(a.employee_id, t)
  }

  const row = (a: (typeof all)[number], actions: boolean) => {
    const c = clash(a)
    return (
      <tr key={a.id}>
        <td><strong>{names.get(a.employee_id) ?? "Ukendt"}</strong>{a.note && <div className="crm-muted">{a.note}</div>}</td>
        <td>{kinds[a.kind] ?? a.kind}</td>
        <td>{d(a.starts_on)}{a.ends_on !== a.starts_on ? ` – ${d(a.ends_on)}` : ""} <span className="crm-muted">({days(a.starts_on, a.ends_on)} d.)</span></td>
        <td>{c ? <Link href={`/admin/vagtplan?visning=maaned&dato=${a.starts_on}&medarbejder=${a.employee_id}`} className="crm-pill status-in_progress">{c} vagt{c === 1 ? "" : "er"} berørt</Link> : <span className="crm-muted">Ingen vagter</span>}</td>
        <td className="crm-right">
          {actions ? (
            <div className="crm-inline">
              <form action={decideAbsence}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="approved" /><button className="crm-btn crm-btn-primary" type="submit"><Check className="size-4" /> Godkend</button></form>
              <form action={decideAbsence}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="declined" /><button className="crm-btn" type="submit"><X className="size-4" /> Afvis</button></form>
            </div>
          ) : (
            <span className={`crm-pill abs-${a.status}`}>{statusLabel[a.status]}</span>
          )}
        </td>
      </tr>
    )
  }
  const table = (list: typeof all, actions: boolean, empty: string) => list.length ? (
    <table className="crm-table"><thead><tr><th>Medarbejder</th><th>Type</th><th>Periode</th><th>Vagter</th><th /></tr></thead><tbody>{list.map((a) => row(a, actions))}</tbody></table>
  ) : <p className="crm-empty">{empty}</p>

  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Fravær</h1><p className="crm-head-sub">Ferie, fridage og sygdom fra medarbejderkontoret. Sygemeldinger godkendes automatisk.</p></div></header>
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Venter på svar</span></div><div className="crm-kpi-row"><strong className={pending.length ? "is-warn" : ""}>{pending.length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Væk i dag</span></div><div className="crm-kpi-row"><strong>{current.length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Kommende fravær</span></div><div className="crm-kpi-row"><strong>{upcoming.length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Sygedage i år</span></div><div className="crm-kpi-row"><strong>{[...totals.values()].reduce((s, t) => s + t.sick, 0)}</strong></div></div>
      </section>
      <article className="crm-card crm-card-flush"><header className="crm-card-head crm-pad"><div><h2>Ansøgninger</h2><p>Godkend eller afvis. Medarbejderen får besked på mail.</p></div></header>{table(pending, true, "Ingen ansøgninger venter.")}</article>
      <div className="crm-pairs">
        <article className="crm-card crm-card-flush"><header className="crm-card-head crm-pad"><div><h2>Væk nu og kommende</h2></div></header>{table([...current, ...upcoming], false, "Ingen planlagt fravær.")}</article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Pr. medarbejder i {today.slice(0, 4)}</h2><p>Godkendte dage</p></div></header>
          {staff.length ? <table className="crm-table"><thead><tr><th>Navn</th><th className="crm-right">Fri/ferie</th><th className="crm-right">Syg</th></tr></thead><tbody>{staff.map((s) => { const t = totals.get(s.id) ?? { sick: 0, off: 0 }; return <tr key={s.id}><td>{s.name}</td><td className="crm-right">{t.off}</td><td className="crm-right">{t.sick}</td></tr> })}</tbody></table> : <p className="crm-empty">Ingen medarbejdere.</p>}
        </article>
      </div>
      {history.length > 0 && <article className="crm-card crm-card-flush"><header className="crm-card-head crm-pad"><div><h2>Afsluttet</h2></div></header>{table(history.slice(0, 50), false, "")}</article>}
    </main>
  )
}
