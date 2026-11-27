import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Trash2 } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { signedUrls } from "@/lib/backend/reports"
import { scoreClass } from "@/lib/quality"
import PhotoUpload from "@/components/photo-upload"
import { deleteInspection, qualityUploadTarget, registerQualityPhoto, saveInspection } from "../actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kvalitetskontrol" }

const words = ["", "Dårlig", "Mangelfuld", "OK", "God", "Perfekt"]

export default async function InspectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gemt?: string; afsluttet?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/kvalitet")
  const { id } = await params
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = createAdminClient()
  const { data: insp } = await db.from("quality_inspections").select("*, location:locations(name, address)").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!insp) notFound()
  const [{ data: items }, { data: photos }, { staff }] = await Promise.all([
    db.from("quality_items").select("id, area, label, score, note").eq("org_id", org.id).eq("inspection_id", id).order("position"),
    db.from("photos").select("id, path, caption").eq("org_id", org.id).eq("inspection_id", id).order("created_at"),
    listStaff(org.id),
  ])
  const urls = await signedUrls((photos ?? []).map((p) => p.path))
  const areas = new Map<string, NonNullable<typeof items>>()
  for (const it of items ?? []) areas.set(it.area || "Opgaver", [...(areas.get(it.area || "Opgaver") ?? []), it])
  const loc = insp.location as unknown as { name: string; address: string } | null
  const doneScore = insp.score != null ? Number(insp.score) : null
  return (
    <main className="admin-shell crm">
      <Link href="/admin/kvalitet" className="crm-back"><ArrowLeft className="size-4" /> Kvalitet</Link>
      <header className="crm-head">
        <div><p className="crm-kicker">Kvalitetskontrol · {new Date(insp.created_at).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}</p><h1>{loc?.name ?? "Sted"}</h1><p className="crm-head-sub">{loc?.address}</p></div>
        {doneScore != null && <div className={`q-big ${scoreClass(doneScore)}`}><strong>{doneScore.toLocaleString("da-DK")} %</strong><small>{insp.status === "done" ? "afsluttet" : "foreløbig"}</small></div>}
      </header>
      {sp.gemt && <p className="admin-notice is-ok">Gemt.</p>}
      {sp.afsluttet && <p className="admin-notice is-ok">Kontrollen er afsluttet{insp.employee_id ? ", og medarbejderen har fået besked" : ""}{insp.share_with_customer ? ". Kunden kan se resultatet i kundeportalen" : ""}.</p>}
      <form action={saveInspection} className="q-form">
        <input type="hidden" name="id" value={insp.id} />
        {[...areas].map(([area, list]) => (
          <article key={area} className="crm-card">
            <header className="crm-card-head"><div><h2>{area}</h2></div></header>
            <ul className="q-items">
              {list.map((it) => (
                <li key={it.id}>
                  <span className="q-label">{it.label}</span>
                  <div className="q-scores" role="radiogroup" aria-label={it.label}>
                    {[1, 2, 3, 4, 5].map((n) => <label key={n} title={words[n]} className={`s${n}`}><input type="radio" name={`score_${it.id}`} value={n} defaultChecked={it.score === n} /><span>{n}</span></label>)}
                    <label className="na" title="Ikke relevant"><input type="radio" name={`score_${it.id}`} value="" defaultChecked={it.score == null} /><span>–</span></label>
                  </div>
                  <input className="q-note" name={`note_${it.id}`} defaultValue={it.note ?? ""} placeholder="Bemærkning" />
                </li>
              ))}
            </ul>
          </article>
        ))}
        <article className="crm-card q-summary">
          <label>Medarbejder, der gjorde rent<select name="employee_id" defaultValue={insp.employee_id ?? ""} className="crm-select"><option value="">Ingen / flere</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Samlet kommentar<textarea name="note" rows={3} defaultValue={insp.note ?? ""} placeholder="Hvad gik godt, hvad skal forbedres?" /></label>
          <label className="au-check"><input type="checkbox" name="share" defaultChecked={insp.share_with_customer} /> Del resultatet med kunden i kundeportalen</label>
          <div className="crm-inline">
            <button className="crm-btn" name="intent" value="save" type="submit">Gem kladde</button>
            <button className="crm-btn crm-btn-primary" name="intent" value="done" type="submit">Afslut kontrol</button>
          </div>
        </article>
      </form>
      <article className="crm-card">
        <header className="crm-card-head"><div><h2>Billeder</h2></div></header>
        <PhotoUpload requestTarget={qualityUploadTarget.bind(null, insp.id)} register={registerQualityPhoto.bind(null, insp.id)} />
        <div className="field-photos">{(photos ?? []).map((p) => urls.get(p.path) && <figure key={p.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={urls.get(p.path)!} alt={p.caption ?? "Billede"} />{p.caption && <figcaption>{p.caption}</figcaption>}</figure>)}</div>
      </article>
      <form action={deleteInspection}><input type="hidden" name="id" value={insp.id} /><button className="crm-btn" type="submit"><Trash2 className="size-4" /> Slet kontrol</button></form>
    </main>
  )
}
