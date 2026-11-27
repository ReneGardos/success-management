import Link from "next/link"
import { Check, GraduationCap, Plus } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { listStaff } from "@/lib/backend/staff"
import { archiveCourse, saveCourse } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kurser" }

export default async function CoursesAdmin({ searchParams }: { searchParams: Promise<{ ret?: string; gemt?: string; fejl?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/kurser")
  const sp = await searchParams
  const db = createAdminClient()
  const [{ data: courses }, { data: done }, { staff }] = await Promise.all([
    db.from("org_courses").select("*").eq("org_id", org.id).eq("active", true).order("position").order("created_at"),
    db.from("course_completions").select("course_id, employee_id, completed_at").eq("org_id", org.id),
    listStaff(org.id),
  ])
  const employees = staff.filter((s) => s.role === "employee")
  const has = (c: string, e: string) => (done ?? []).some((d) => d.course_id === c && d.employee_id === e)
  const edit = (courses ?? []).find((c) => c.id === sp.ret)
  const required = (courses ?? []).filter((c) => c.required)
  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1><GraduationCap className="size-6 inline" /> Kurser og oplæring</h1><p className="crm-head-sub">Korte kurser medarbejderne gennemfører i appen. Se hvem der mangler.</p></div><Link href="/admin/kurser?ret=ny#form" className="crm-btn crm-btn-primary"><Plus className="size-4" /> Nyt kursus</Link></header>
      {sp.gemt && <p className="admin-notice is-ok">Gemt.</p>}
      {sp.fejl && <p className="admin-notice is-error">{sp.fejl}</p>}
      <article className="crm-card crm-card-flush">
        <header className="crm-card-head crm-pad"><div><h2>Status pr. medarbejder</h2><p>{required.length} obligatoriske kurser</p></div></header>
        <div className="crm-scroll"><table className="crm-table course-matrix">
          <thead><tr><th>Medarbejder</th>{(courses ?? []).map((c) => <th key={c.id} title={c.title}><Link href={`/admin/kurser?ret=${c.id}#form`}>{c.title}</Link></th>)}<th className="crm-right">Gennemført</th></tr></thead>
          <tbody>
            {employees.map((e) => { const n = required.filter((c) => has(c.id, e.id)).length; return (
              <tr key={e.id}><td>{e.name}</td>{(courses ?? []).map((c) => <td key={c.id} className="crm-center">{has(c.id, e.id) ? <span className="cm-yes"><Check className="size-4" /></span> : <span className={c.required ? "cm-no" : "crm-muted"}>–</span>}</td>)}<td className="crm-right"><span className={`q-pill ${n === required.length ? "is-good" : n ? "is-mid" : "is-low"}`}>{n}/{required.length}</span></td></tr>
            ) })}
            {!employees.length && <tr><td colSpan={(courses ?? []).length + 2} className="crm-empty">Ingen medarbejdere endnu.</td></tr>}
          </tbody>
        </table></div>
      </article>
      {(sp.ret === "ny" || edit) && (
        <form action={saveCourse} className="crm-card doc-edit" id="form">
          <header className="crm-card-head"><div><h2>{edit ? "Redigér kursus" : "Nyt kursus"}</h2></div></header>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <label>Titel<input name="title" required defaultValue={edit?.title ?? ""} /></label>
          <label>Kort beskrivelse<input name="summary" defaultValue={edit?.summary ?? ""} /></label>
          <div className="doc-row"><label>Video (YouTube/Vimeo-link)<input name="video_url" defaultValue={edit?.video_url ?? ""} placeholder="https://www.youtube.com/watch?v=…" /></label><label>Minutter<input name="minutes" type="number" min={0} max={600} defaultValue={edit?.minutes ?? ""} /></label><label className="au-check"><input type="checkbox" name="required" defaultChecked={edit?.required ?? true} /> Obligatorisk</label></div>
          <label>Indhold (## overskrift, - punkt, **fed**)<textarea name="content" rows={14} defaultValue={edit?.content ?? ""} /></label>
          <div className="crm-inline"><button type="submit" className="crm-btn crm-btn-primary">Gem kursus</button><Link href="/admin/kurser" className="crm-btn">Annullér</Link></div>
        </form>
      )}
      {edit && <form action={archiveCourse}><input type="hidden" name="id" value={edit.id} /><button className="crm-btn" type="submit">Arkivér kursus</button></form>}
    </main>
  )
}
