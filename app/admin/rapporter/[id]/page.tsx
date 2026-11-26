import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Check, Clock, ExternalLink, MapPin, X } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadProducts, loadReport, photoKindLabels, productStatusLabels } from "@/lib/backend/reports"
import { formatDuration, formatTime } from "@/lib/time"
import { appUrl } from "@/lib/org"
import { deletePhoto, setReportVisibility } from "../actions"

export const dynamic = "force-dynamic"

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { org } = await requireRolePage(["admin"], `/admin/rapporter/${id}`)
  const report = await loadReport(org.id, id)
  if (!report) notFound()
  const db = createAdminClient()
  const [{ data: job }, { data: entry }, { data: emp }, products, { data: feedback }] = await Promise.all([
    report.job_id ? db.from("jobs").select("title, scheduled_start, scheduled_end, location:locations(name, address, radius_m)").eq("org_id", org.id).eq("id", report.job_id).maybeSingle() : Promise.resolve({ data: null }),
    report.time_entry_id
      ? db.from("time_entries").select("check_in_at, check_out_at, check_in_distance_m, check_out_distance_m").eq("org_id", org.id).eq("id", report.time_entry_id).maybeSingle()
      : report.job_id ? db.from("time_entries").select("check_in_at, check_out_at, check_in_distance_m, check_out_distance_m").eq("org_id", org.id).eq("job_id", report.job_id).eq("employee_id", report.employee_id ?? "").order("check_in_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    report.employee_id ? db.from("profiles").select("full_name").eq("id", report.employee_id).maybeSingle() : Promise.resolve({ data: null }),
    loadProducts(org.id),
    db.from("customer_feedback").select("id, message, author_name, created_at, status").eq("org_id", org.id).eq("report_id", id).order("created_at"),
  ])
  const loc = (job?.location as unknown as { name: string; address: string; radius_m: number } | null) ?? null
  const done = report.items.filter((i) => i.done)
  const notDone = report.items.filter((i) => !i.done)
  const pmap = new Map(products.map((p) => [p.id, p]))
  const shareUrl = `${appUrl()}/r/${report.public_token}`

  return (
    <main className="admin-shell crm">
      <Link href="/admin/rapporter" className="crm-back"><ArrowLeft className="size-4" /> Rapporter</Link>
      <header className="crm-head">
        <div>
          <p className="crm-kicker">Rengøringsrapport · {report.status === "submitted" ? "sendt" : "i gang"}</p>
          <h1>{loc?.name ?? job?.title ?? "Vagt"}</h1>
          <p className="crm-head-sub">{emp?.full_name ?? "Medarbejder"} · {job?.scheduled_start ? new Date(job.scheduled_start).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" }) : ""}{loc?.address ? <> · <MapPin className="size-3 inline" /> {loc.address}</> : null}</p>
        </div>
        <div className="crm-head-actions">
          <a href={shareUrl} target="_blank" rel="noreferrer" className="crm-btn"><ExternalLink className="size-4" /> Kundens visning</a>
          <form action={setReportVisibility}><input type="hidden" name="id" value={report.id} /><input type="hidden" name="visible" value={String(!report.customer_visible)} /><button type="submit" className="crm-btn">{report.customer_visible ? "Skjul for kunden" : "Vis for kunden"}</button></form>
        </div>
      </header>

      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><Clock className="size-4" /><span>Tjekket ind</span></div><div className="crm-kpi-row"><strong>{entry?.check_in_at ? formatTime(entry.check_in_at) : "–"}</strong></div><div className="crm-kpi-foot"><small>{entry?.check_in_distance_m != null ? `${entry.check_in_distance_m} m fra stedet` : "ingen position"}{job?.scheduled_start ? ` · planlagt ${formatTime(job.scheduled_start)}` : ""}</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><Clock className="size-4" /><span>Tjekket ud</span></div><div className="crm-kpi-row"><strong>{entry?.check_out_at ? formatTime(entry.check_out_at) : "–"}</strong></div><div className="crm-kpi-foot"><small>{entry?.check_out_distance_m != null ? `${entry.check_out_distance_m} m fra stedet` : entry?.check_out_at ? "ingen position" : "ikke tjekket ud"}{job?.scheduled_end ? ` · planlagt ${formatTime(job.scheduled_end)}` : ""}</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Tid brugt</span></div><div className="crm-kpi-row"><strong>{entry?.check_in_at ? formatDuration((entry.check_out_at ? new Date(entry.check_out_at).getTime() : Date.now()) - new Date(entry.check_in_at).getTime()) : "–"}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Opgaver udført</span></div><div className="crm-kpi-row"><strong>{done.length}/{report.items.length}</strong></div><div className="crm-kpi-foot"><small>{notDone.length ? `${notDone.length} ikke udført` : "Alt udført"}</small></div></div>
      </section>

      <div className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Udført</h2></div></header>
          <ul className="crm-checks">{done.map((i) => <li key={i.id} className="is-done"><Check className="size-4" /><span>{i.label}{i.note ? <small>{i.note}</small> : null}</span></li>)}{!done.length && <li className="crm-muted">Intet afkrydset.</li>}</ul>
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Ikke udført</h2></div></header>
          <ul className="crm-checks">{notDone.map((i) => <li key={i.id} className="is-missing"><X className="size-4" /><span>{i.label}{i.note ? <small>{i.note}</small> : null}</span></li>)}{!notDone.length && <li className="crm-muted">Alt er udført.</li>}</ul>
        </article>
        <article className="crm-card crm-card-flush">
          <header className="crm-card-head crm-pad"><div><h2>Produkter</h2><p>Status på stedet og hvad der er taget</p></div></header>
          {report.products.length ? (
            <table className="crm-table"><thead><tr><th>Produkt</th><th>Status</th><th className="num">Taget</th></tr></thead><tbody>
              {report.products.map((p) => <tr key={p.product_id}><td>{pmap.get(p.product_id)?.name ?? "Produkt"}</td><td><span className={`crm-pill ${p.status === "ok" ? "inv-paid" : p.status === "low" ? "status-in_progress" : "inv-overdue"}`}>{productStatusLabels[p.status]}</span></td><td className="num">{p.qty_taken || "–"} {p.qty_taken ? pmap.get(p.product_id)?.unit : ""}</td></tr>)}
            </tbody></table>
          ) : <p className="crm-empty">Ingen produkter registreret.</p>}
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Bemærkninger</h2></div></header>
          {report.note ? <p className="crm-quote">{report.note}</p> : <p className="crm-empty">Ingen bemærkninger.</p>}
          {(feedback?.length ?? 0) > 0 && <><h3 className="crm-sub-title">Kundens kommentarer</h3><ul className="crm-list">{feedback!.map((f) => <li key={f.id}><span>{f.message}</span><small>{f.author_name ?? "Kunde"} · {new Date(f.created_at).toLocaleDateString("da-DK")}</small></li>)}</ul></>}
        </article>
      </div>

      <article className="crm-card">
        <header className="crm-card-head"><div><h2>Billeder</h2><p>{report.photos.length} billeder</p></div></header>
        {report.photos.length ? (
          <div className="crm-gallery">
            {report.photos.map((ph) => (
              <figure key={ph.id}>
                {ph.url && <a href={ph.url} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={ph.url} alt={ph.caption ?? photoKindLabels[ph.kind]} loading="lazy" /></a>}
                <figcaption><span className={`crm-pill ${ph.kind === "issue" || ph.kind === "customer" ? "inv-overdue" : ""}`}>{photoKindLabels[ph.kind]}</span> {ph.caption}</figcaption>
                <form action={deletePhoto}><input type="hidden" name="id" value={ph.id} /><button type="submit" className="crm-link">Slet</button></form>
              </figure>
            ))}
          </div>
        ) : <p className="crm-empty">Ingen billeder.</p>}
      </article>
    </main>
  )
}
