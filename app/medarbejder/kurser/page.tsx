import Link from "next/link"
import { Award, CheckCircle2, ChevronRight, Clock, Star } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { scoreClass } from "@/lib/quality"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kurser og kvalitet" }

export default async function EmployeeCourses() {
  const p = await employeePortal("/medarbejder/kurser")
  const db = createAdminClient()
  const [{ data: courses }, { data: done }, { data: inspections }] = await Promise.all([
    db.from("org_courses").select("id, title, summary, minutes, required, video_url").eq("org_id", p.org.id).eq("active", true).order("position"),
    db.from("course_completions").select("course_id, completed_at").eq("org_id", p.org.id).eq("employee_id", p.userId),
    db.from("quality_inspections").select("id, score, completed_at, note, location:locations(name)").eq("org_id", p.org.id).eq("employee_id", p.userId).eq("status", "done").order("completed_at", { ascending: false }).limit(12),
  ])
  const doneIds = new Set((done ?? []).map((d) => d.course_id))
  const required = (courses ?? []).filter((c) => c.required)
  const progress = required.length ? Math.round((required.filter((c) => doneIds.has(c.id)).length / required.length) * 100) : 100
  const scores = (inspections ?? []).map((i) => Number(i.score)).filter((n) => !Number.isNaN(n))
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Kurser og kvalitet</h1><p>Din oplæring og resultaterne af kvalitetskontroller.</p></header>
      <div className="pt-kpis">
        <div><small><Award className="size-4 inline" /> Kurser gennemført</small><strong>{progress} %</strong><span className="pt-progress"><i style={{ width: `${progress}%` }} /></span></div>
        <div><small><Star className="size-4 inline" /> Kvalitetsscore</small><strong className={`q-score ${scoreClass(avg)}`}>{avg != null ? `${avg.toFixed(0)} %` : "–"}</strong><em>{scores.length} kontrol{scores.length === 1 ? "" : "ler"}</em></div>
      </div>
      <section className="pt-section">
        <h2>Kurser</h2>
        <ul className="course-list">
          {(courses ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/medarbejder/kurser/${c.id}`} className={doneIds.has(c.id) ? "is-done" : ""}>
                <span className="course-ic">{doneIds.has(c.id) ? <CheckCircle2 className="size-5" /> : <Award className="size-5" />}</span>
                <span className="course-tx"><strong>{c.title}</strong><small>{c.summary}</small><em>{c.minutes ? <><Clock className="size-3 inline" /> {c.minutes} min</> : null}{c.required && !doneIds.has(c.id) ? " · obligatorisk" : ""}{c.video_url ? " · video" : ""}</em></span>
                <ChevronRight className="size-5" />
              </Link>
            </li>
          ))}
          {!courses?.length && <li className="pt-empty">Ingen kurser endnu.</li>}
        </ul>
      </section>
      {(inspections ?? []).length > 0 && (
        <section className="pt-card">
          <h2>Seneste kvalitetskontroller</h2>
          <ul className="pt-mini">{(inspections ?? []).map((i) => <li key={i.id}><span><strong>{(i.location as unknown as { name: string } | null)?.name}</strong><small>{i.completed_at ? new Date(i.completed_at).toLocaleDateString("da-DK") : ""}{i.note ? ` · ${i.note.slice(0, 80)}` : ""}</small></span><b><span className={`q-pill ${scoreClass(Number(i.score))}`}>{Number(i.score).toFixed(0)} %</span></b></li>)}</ul>
        </section>
      )}
    </main>
  )
}
