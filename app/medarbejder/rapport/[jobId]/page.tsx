import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Clock, MapPin } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureReport, loadProducts, loadReport, photoKindLabels } from "@/lib/backend/reports"
import { formatTime } from "@/lib/time"
import PhotoUpload from "@/components/photo-upload"
import { registerReportPhoto, reportUploadTarget, saveReport } from "../actions"
import { getViewAs } from "@/lib/view-as"
import ViewAsBanner from "@/components/view-as-banner"

export const dynamic = "force-dynamic"
export const metadata = { title: "Rengøringsrapport", robots: { index: false, follow: false } }

export default async function ReportForm({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<{ gemt?: string }> }) {
  const { jobId } = await params
  const { org, user: me, ctx } = await requireRolePage(["employee", "admin"], `/medarbejder/rapport/${jobId}`)
  const viewAs = await getViewAs(ctx)
  const preview = viewAs?.type === "employee" ? viewAs : null
  const user = preview ? { id: preview.id } : me
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound()
  const db = createAdminClient()
  const { data: assigned } = await db.from("job_assignments").select("job_id").eq("org_id", org.id).eq("job_id", jobId).eq("employee_id", user.id).maybeSingle()
  if (!assigned) notFound()
  const { data: job } = await db.from("jobs").select("id, title, scheduled_start, location:locations(name, address)").eq("org_id", org.id).eq("id", jobId).maybeSingle()
  // In preview nothing is created: show the employee's existing report, if any.
  const reportId = preview
    ? ((await db.from("cleaning_reports").select("id").eq("org_id", org.id).eq("job_id", jobId).eq("employee_id", user.id).maybeSingle()).data?.id as string | undefined)
    : await ensureReport(org.id, jobId, user.id)
  if (!reportId) {
    return (
      <>
        {preview && <ViewAsBanner viewAs={preview} />}
        <main className="field"><Link href="/medarbejder" className="field-back"><ArrowLeft className="size-5" /> Mine vagter</Link><p className="field-ok">{preview?.name} har ikke startet en rapport for denne vagt endnu.</p></main>
      </>
    )
  }
  const [report, products, { data: entry }] = await Promise.all([
    loadReport(org.id, reportId),
    loadProducts(org.id),
    db.from("time_entries").select("check_in_at, check_out_at").eq("org_id", org.id).eq("job_id", jobId).eq("employee_id", user.id).order("check_in_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!report) notFound()
  const loc = job?.location as unknown as { name: string; address: string } | null
  const prodStatus = new Map(report.products.map((p) => [p.product_id, p]))
  const done = report.items.filter((i) => i.done).length

  return (
    <>
    {preview && <ViewAsBanner viewAs={preview} />}
    <main className={`field${preview ? " viewas-readonly" : ""}`} style={{ ["--primary" as string]: org.color_primary, ["--accent" as string]: org.color_accent }}>
      <Link href="/medarbejder" className="field-back"><ArrowLeft className="size-5" /> Mine vagter</Link>
      <header className="field-head">
        <p>{org.name} · Rengøringsrapport</p>
        <h1>{job?.title || loc?.name || "Vagt"}</h1>
        {loc?.address && <span><MapPin className="size-4" /> {loc.address}</span>}
        <span><Clock className="size-4" /> {entry?.check_in_at ? `Ind ${formatTime(entry.check_in_at)}` : "Ikke tjekket ind"}{entry?.check_out_at ? ` · ud ${formatTime(entry.check_out_at)}` : ""}</span>
      </header>
      {sp.gemt && <p className="field-ok" role="status">Gemt. Du kan fortsætte senere.</p>}
      {report.status === "submitted" && <p className="field-ok" role="status">Rapporten er sendt. Du kan stadig rette den.</p>}

      <form action={saveReport} className="field-form">
        <fieldset disabled={Boolean(preview)} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 14 }}>
        <input type="hidden" name="report_id" value={report.id} />
        <section className="field-card">
          <h2>Opgaver <small>{done}/{report.items.length} udført</small></h2>
          <ul className="field-tasks">
            {report.items.map((it) => (
              <li key={it.id}>
                <label className="field-task">
                  <input type="checkbox" name={`done_${it.id}`} defaultChecked={it.done} />
                  <span className="field-tick" aria-hidden="true" />
                  <span>{it.label}{it.area ? <small>{it.area}</small> : null}</span>
                </label>
                <input className="field-note" name={`note_${it.id}`} defaultValue={it.note ?? ""} placeholder="Bemærkning – fx hvorfor ikke udført" />
              </li>
            ))}
          </ul>
        </section>

        {products.length > 0 && (
          <section className="field-card">
            <h2>Produkter på stedet</h2>
            <p className="field-hint">Tryk på status. “Mangler” giver kontoret besked med det samme.</p>
            <ul className="field-products">
              {products.map((p) => {
                const cur = prodStatus.get(p.id)
                return (
                  <li key={p.id}>
                    <input type="hidden" name="product_id" value={p.id} />
                    <strong>{p.name}</strong>
                    <div className="field-seg" role="radiogroup" aria-label={`Status for ${p.name}`}>
                      {(["ok", "low", "missing"] as const).map((s) => (
                        <label key={s} className={`is-${s}`}><input type="radio" name={`status_${p.id}`} value={s} defaultChecked={(cur?.status ?? "ok") === s} /><span>{s === "ok" ? "Nok" : s === "low" ? "Snart tom" : "Mangler"}</span></label>
                      ))}
                    </div>
                    <label className="field-taken">Taget<input name={`taken_${p.id}`} inputMode="decimal" defaultValue={cur?.qty_taken ? String(cur.qty_taken) : ""} placeholder="0" /> {p.unit}</label>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="field-card">
          <h2>Bemærkninger</h2>
          <textarea name="note" rows={3} defaultValue={report.note ?? ""} placeholder="Noget kunden eller kontoret skal vide?" />
        </section>

        <div className="field-actions">
          <button type="submit" name="intent" value="save" className="field-btn">Gem</button>
          <button type="submit" name="intent" value="submit" className="field-btn field-btn-primary">Send rapport</button>
        </div>
        </fieldset>
      </form>

      <section className="field-card">
        <h2>Billeder</h2>
        {!preview && <PhotoUpload requestTarget={reportUploadTarget.bind(null, report.id)} register={registerReportPhoto.bind(null, report.id)} kinds={[{ value: "issue", label: "Problem" }, { value: "unusual", label: "Usædvanligt" }, { value: "before", label: "Før" }, { value: "after", label: "Efter" }]} />}
        {report.photos.length > 0 && (
          <div className="field-photos">
            {report.photos.map((ph) => ph.url && (
              <figure key={ph.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={ph.caption ?? photoKindLabels[ph.kind]} />
                <figcaption>{photoKindLabels[ph.kind]}{ph.caption ? ` · ${ph.caption}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </main>
    </>
  )
}
