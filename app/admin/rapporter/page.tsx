import Link from "next/link"
import { Camera, ClipboardCheck } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"

export const dynamic = "force-dynamic"
export const metadata = { title: "Rapporter" }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ sted?: string; medarbejder?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/rapporter")
  const sp = await searchParams
  const db = createAdminClient()
  let query = db.from("cleaning_reports").select("id, status, created_at, submitted_at, location_id, employee_id, customer_rating, signature_path, job:jobs(title, scheduled_start), location:locations(name)").eq("org_id", org.id).order("created_at", { ascending: false }).limit(200)
  if (sp.sted && /^[0-9a-f-]{36}$/i.test(sp.sted)) query = query.eq("location_id", sp.sted)
  if (sp.medarbejder && /^[0-9a-f-]{36}$/i.test(sp.medarbejder)) query = query.eq("employee_id", sp.medarbejder)
  const [{ data: reports }, { staff }, { data: locations }, { count: openSupply }, { count: openFeedback }] = await Promise.all([
    query,
    listStaff(org.id),
    db.from("locations").select("id, name").eq("org_id", org.id).order("name"),
    db.from("supply_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).neq("status", "done"),
    db.from("customer_feedback").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "open"),
  ])
  const ids = (reports ?? []).map((r) => r.id)
  const [{ data: items }, { data: photos }] = ids.length
    ? await Promise.all([
        db.from("cleaning_report_items").select("report_id, done").eq("org_id", org.id).in("report_id", ids),
        db.from("photos").select("report_id, kind").eq("org_id", org.id).in("report_id", ids),
      ])
    : [{ data: [] }, { data: [] }]
  const stats = new Map<string, { done: number; total: number; photos: number; issues: number }>()
  for (const i of items ?? []) { const s = stats.get(i.report_id) ?? { done: 0, total: 0, photos: 0, issues: 0 }; s.total++; if (i.done) s.done++; stats.set(i.report_id, s) }
  for (const p of photos ?? []) { const s = stats.get(String(p.report_id)) ?? { done: 0, total: 0, photos: 0, issues: 0 }; s.photos++; if (p.kind === "issue") s.issues++; stats.set(String(p.report_id), s) }
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const all = [...stats.values()]
  const rated = (reports ?? []).filter((r) => r.customer_rating)
  const avgRating = rated.length ? rated.reduce((a, r) => a + Number(r.customer_rating), 0) / rated.length : 0
  const completion = all.reduce((a, s) => a + s.total, 0) ? Math.round((all.reduce((a, s) => a + s.done, 0) / all.reduce((a, s) => a + s.total, 0)) * 100) : 0

  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Rengøringsrapporter</h1><p className="crm-head-sub">Hvad medarbejderne har lavet og ikke lavet, med check-ind og -ud, produkter og billeder.</p></div></header>
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Rapporter</span></div><div className="crm-kpi-row"><strong>{reports?.length ?? 0}</strong></div><div className="crm-kpi-foot"><small>seneste 200</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Opgaver udført</span></div><div className="crm-kpi-row"><strong>{completion}%</strong></div><div className="crm-kpi-foot"><small>af alle afkrydsede opgaver</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Kundetilfredshed</span></div><div className="crm-kpi-row"><strong className={avgRating && avgRating < 4 ? "is-warn" : ""}>{avgRating ? `${avgRating.toFixed(1).replace(".", ",")} ★` : "–"}</strong></div><div className="crm-kpi-foot"><small>{rated.length} bedømte besøg</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Kvitteret af kunden</span></div><div className="crm-kpi-row"><strong>{(reports ?? []).filter((r) => r.signature_path).length}</strong></div><div className="crm-kpi-foot"><small>med underskrift</small></div></div>
        <Link href="/admin/forsyning" className="crm-kpi"><div className="crm-kpi-top"><span>Åbne mangler</span></div><div className="crm-kpi-row"><strong className={openSupply ? "is-warn" : ""}>{openSupply ?? 0}</strong></div><div className="crm-kpi-foot"><small>Se forsyning</small></div></Link>
        <Link href="/admin/feedback" className="crm-kpi"><div className="crm-kpi-top"><span>Kundefeedback</span></div><div className="crm-kpi-row"><strong className={openFeedback ? "is-warn" : ""}>{openFeedback ?? 0}</strong></div><div className="crm-kpi-foot"><small>ubehandlede</small></div></Link>
      </section>
      <form className="crm-inline">
        <select name="sted" defaultValue={sp.sted ?? ""} aria-label="Sted"><option value="">Alle steder</option>{(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select name="medarbejder" defaultValue={sp.medarbejder ?? ""} aria-label="Medarbejder"><option value="">Alle medarbejdere</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button type="submit" className="crm-btn">Filtrér</button>
      </form>
      <article className="crm-card crm-card-flush">
        {reports?.length ? (
          <table className="crm-table">
            <thead><tr><th>Dato</th><th>Sted</th><th>Medarbejder</th><th>Udført</th><th>Billeder</th><th>Kunde</th><th>Status</th></tr></thead>
            <tbody>
              {reports.map((r) => {
                const s = stats.get(r.id) ?? { done: 0, total: 0, photos: 0, issues: 0 }
                const job = r.job as unknown as { title: string | null; scheduled_start: string | null } | null
                return (
                  <tr key={r.id}>
                    <td className="crm-mono"><Link href={`/admin/rapporter/${r.id}`}>{new Date(job?.scheduled_start ?? r.created_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })}</Link></td>
                    <td><Link href={`/admin/rapporter/${r.id}`}>{(r.location as unknown as { name: string } | null)?.name ?? job?.title ?? "Vagt"}</Link></td>
                    <td>{names.get(String(r.employee_id)) ?? "–"}</td>
                    <td><div className="crm-progress"><i style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} /></div><small className="crm-cell-sub">{s.done}/{s.total}</small></td>
                    <td>{s.photos ? <span className={s.issues ? "is-warn" : ""}><Camera className="size-3.5 inline" /> {s.photos}</span> : "–"}</td>
                    <td>{r.customer_rating ? <span className={Number(r.customer_rating) <= 3 ? "is-warn" : ""}>{"★".repeat(Number(r.customer_rating))}<span className="crm-muted">{"★".repeat(5 - Number(r.customer_rating))}</span></span> : r.signature_path ? <span className="crm-muted">✍︎ kvitteret</span> : "–"}</td>
                    <td><span className={`crm-pill ${r.status === "submitted" ? "inv-paid" : "inv-draft"}`}>{r.status === "submitted" ? "Sendt" : "I gang"}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <p className="crm-empty"><ClipboardCheck className="size-4 inline" /> Ingen rapporter endnu. Medarbejderne udfylder dem fra deres vagter.</p>}
      </article>
    </main>
  )
}
