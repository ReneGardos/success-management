import Link from "next/link"
import { ClipboardCheck, Plus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { AreaChart, HBars } from "@/components/charts"
import { startInspection } from "./actions"
import { scoreClass } from "@/lib/quality"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kvalitet" }


export default async function QualityPage({ searchParams }: { searchParams: Promise<{ fejl?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/kvalitet")
  const sp = await searchParams
  const db = createAdminClient()
  const [{ data: list }, { data: locations }, { staff }] = await Promise.all([
    db.from("quality_inspections").select("id, status, score, created_at, completed_at, employee_id, share_with_customer, location:locations(id, name)").eq("org_id", org.id).order("created_at", { ascending: false }).limit(300),
    db.from("locations").select("id, name").eq("org_id", org.id).eq("active", true).order("name"),
    listStaff(org.id),
  ])
  const done = (list ?? []).filter((i) => i.status === "done" && i.score != null)
  const avg = done.length ? done.reduce((t, i) => t + Number(i.score), 0) / done.length : 0
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const byEmp = new Map<string, number[]>(), byLoc = new Map<string, number[]>()
  for (const i of done) {
    if (i.employee_id) byEmp.set(i.employee_id, [...(byEmp.get(i.employee_id) ?? []), Number(i.score)])
    const ln = (i.location as unknown as { name: string } | null)?.name ?? "Ukendt"
    byLoc.set(ln, [...(byLoc.get(ln) ?? []), Number(i.score)])
  }
  const avgOf = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - 5 + i); return d.toISOString().slice(0, 7) })
  const trend = months.map((m) => { const l = done.filter((i) => String(i.completed_at ?? i.created_at).slice(0, 7) === m); return l.length ? Math.round(avgOf(l.map((x) => Number(x.score)))) : 0 })
  return (
    <main className="admin-shell crm">
      <header className="crm-head">
        <div><p className="crm-kicker">{org.name}</p><h1>Kvalitetskontrol</h1><p className="crm-head-sub">Stikprøver ude hos kunderne med score pr. område. Resultatet kan deles med kunden og medarbejderen.</p></div>
        <form action={startInspection} className="crm-inline">
          <select name="location_id" required defaultValue="" className="crm-select"><option value="" disabled>Vælg sted…</option>{(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <button className="crm-btn crm-btn-primary" type="submit"><Plus className="size-4" /> Ny kontrol</button>
        </form>
      </header>
      {sp.fejl && <p className="admin-notice is-error">{sp.fejl}</p>}
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Gns. score</span></div><div className="crm-kpi-row"><strong className={`q-score ${scoreClass(avg || null)}`}>{avg ? `${avg.toFixed(1).replace(".", ",")} %` : "–"}</strong></div><div className="crm-kpi-foot"><small>{done.length} kontroller</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Under 75 %</span></div><div className="crm-kpi-row"><strong className={done.some((i) => Number(i.score) < 75) ? "is-warn" : ""}>{done.filter((i) => Number(i.score) < 75).length}</strong></div><div className="crm-kpi-foot"><small>kræver opfølgning</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Delt med kunder</span></div><div className="crm-kpi-row"><strong>{done.filter((i) => i.share_with_customer).length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Kladder</span></div><div className="crm-kpi-row"><strong>{(list ?? []).filter((i) => i.status === "draft").length}</strong></div></div>
      </section>
      <div className="crm-pairs">
        <article className="crm-card"><header className="crm-card-head"><div><h2>Udvikling (6 mdr.)</h2></div></header><AreaChart id="q" labels={months.map((m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("da-DK", { month: "short", timeZone: "UTC" }))} series={[{ name: "Score %", color: org.color_primary, values: trend }]} /></article>
        <article className="crm-card"><header className="crm-card-head"><div><h2>Pr. medarbejder</h2><p>Gennemsnitlig score</p></div></header>{byEmp.size ? <HBars color={org.color_accent} rows={[...byEmp].map(([id, a]) => ({ label: names.get(id) ?? "Ukendt", value: Math.round(avgOf(a)), hint: `${a.length} kontrol${a.length === 1 ? "" : "ler"}` })).sort((a, b) => b.value - a.value)} /> : <p className="crm-empty">Ingen data endnu.</p>}</article>
      </div>
      <article className="crm-card crm-card-flush">
        <header className="crm-card-head crm-pad"><div><h2>Kontroller</h2></div></header>
        {(list ?? []).length ? <table className="crm-table"><thead><tr><th>Dato</th><th>Sted</th><th>Medarbejder</th><th>Score</th><th>Status</th></tr></thead><tbody>
          {(list ?? []).map((i) => <tr key={i.id}><td><Link href={`/admin/kvalitet/${i.id}`}>{new Date(i.completed_at ?? i.created_at).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}</Link></td><td>{(i.location as unknown as { name: string } | null)?.name ?? "–"}</td><td>{i.employee_id ? names.get(i.employee_id) ?? "–" : "–"}</td><td>{i.score != null ? <span className={`q-pill ${scoreClass(Number(i.score))}`}>{Number(i.score).toLocaleString("da-DK")} %</span> : "–"}</td><td><span className={`crm-pill ${i.status === "done" ? "inv-paid" : "inv-draft"}`}>{i.status === "done" ? (i.share_with_customer ? "Afsluttet · delt" : "Afsluttet") : "Kladde"}</span></td></tr>)}
        </tbody></table> : <p className="crm-empty"><ClipboardCheck className="size-4 inline" /> Ingen kontroller endnu. Vælg et sted og start den første – den virker fint på iPad.</p>}
      </article>
      {byLoc.size > 0 && <article className="crm-card"><header className="crm-card-head"><div><h2>Pr. sted</h2></div></header><HBars color={org.color_primary} rows={[...byLoc].map(([n, a]) => ({ label: n, value: Math.round(avgOf(a)), hint: `${a.length}` })).sort((a, b) => a.value - b.value)} /></article>}
    </main>
  )
}
