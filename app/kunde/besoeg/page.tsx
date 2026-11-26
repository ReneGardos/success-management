import { CalendarClock, CalendarX2, MapPin } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { calendarFeed } from "@/lib/backend/calendar"
import { formatDay, formatTime } from "@/lib/time"
import CalendarSubscribe from "@/components/calendar-subscribe"
import { requestVisitChange } from "../actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Besøg" }

const statusText: Record<string, string> = { pending: "Venter på svar", approved: "Godkendt", declined: "Afvist" }

export default async function CustomerVisits({ searchParams }: { searchParams: Promise<{ sendt?: string; fejl?: string }> }) {
  const p = await customerPortal("/kunde/besoeg")
  const sp = await searchParams
  const db = createAdminClient()
  const locs = p.locIds.length ? p.locIds : ["00000000-0000-0000-0000-000000000000"]
  const until = new Date(Date.now() + 70 * 86400000).toISOString()
  const [{ data: jobs }, { data: requests }, feed] = await Promise.all([
    db.from("jobs").select("id, title, scheduled_start, scheduled_end, status, location:locations(name)").eq("org_id", p.org.id).in("location_id", locs).gte("scheduled_start", new Date().toISOString()).lte("scheduled_start", until).order("scheduled_start").limit(40),
    db.from("visit_requests").select("id, job_id, kind, wish_date, note, status, created_at").eq("org_id", p.org.id).in("customer_id", p.ids).order("created_at", { ascending: false }).limit(30),
    p.preview || !p.customerIds[0] ? Promise.resolve(null) : calendarFeed(p.org.id, p.user.id, "customer", p.customerIds[0]),
  ])
  const pendingFor = new Map((requests ?? []).filter((r) => r.status === "pending").map((r) => [r.job_id, r]))
  const minDate = new Date().toISOString().slice(0, 10)
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Besøg</h1><p>Jeres planlagte rengøringer. Skal et besøg flyttes eller springes over, så sig til her.</p></header>
      {sp.sendt && <p className="field-ok" role="status">Tak! Vi har fået jeres ønske og vender tilbage hurtigst muligt.</p>}
      {sp.fejl && <p className="field-err" role="alert">{sp.fejl}</p>}
      <div className="pt-cta"><CalendarSubscribe feed={feed} label="Tilføj besøg til min kalender" /></div>
      <section className="pt-card">
        <h2>Kommende besøg</h2>
        <ul className="pt-visits">
          {(jobs ?? []).map((j) => {
            const pend = pendingFor.get(j.id)
            const cancelled = j.status === "cancelled"
            return (
              <li key={j.id} className={cancelled ? "is-cancelled" : ""}>
                <div className="pt-visit-main">
                  <span className="pt-visit-date"><b>{new Date(j.scheduled_start!).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric" })}</b><small>{new Date(j.scheduled_start!).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", month: "short" })}</small></span>
                  <span className="pt-visit-tx"><strong>{formatDay(j.scheduled_start!)}</strong><small>{formatTime(j.scheduled_start!)}{j.scheduled_end ? `–${formatTime(j.scheduled_end)}` : ""} · <MapPin className="size-3 inline" /> {(j.location as unknown as { name: string } | null)?.name ?? j.title}</small></span>
                  {cancelled ? <span className="pt-pill s-cancelled">Aflyst</span> : pend ? <span className="pt-pill a-pending">{pend.kind === "skip" ? "Spring over" : "Flyt"} · venter</span> : null}
                </div>
                {!cancelled && !pend && !p.preview && (
                  <details className="pt-visit-change">
                    <summary>Flyt eller spring over</summary>
                    <form action={requestVisitChange} className="rv-form">
                      <input type="hidden" name="job_id" value={j.id} />
                      <div className="pt-seg-radio">
                        <label><input type="radio" name="kind" value="move" defaultChecked /><span><CalendarClock className="size-4 inline" /> Flyt</span></label>
                        <label><input type="radio" name="kind" value="skip" /><span><CalendarX2 className="size-4 inline" /> Spring over</span></label>
                      </div>
                      <div className="pt-two">
                        <label>Ønsket dato (ved flyt)<input type="date" name="wish_date" min={minDate} /></label>
                        <label>Tidspunkt<input type="time" name="wish_time" /></label>
                      </div>
                      <textarea name="note" rows={2} placeholder="Evt. besked" maxLength={500} />
                      <button type="submit" className="field-btn field-btn-primary">Send ønske</button>
                    </form>
                  </details>
                )}
              </li>
            )
          })}
          {!jobs?.length && <li className="pt-empty">Ingen planlagte besøg de næste 10 uger.</li>}
        </ul>
      </section>
      {(requests ?? []).some((r) => r.status !== "pending") && (
        <section className="pt-card">
          <h2>Tidligere ønsker</h2>
          <ul className="pt-mini">
            {(requests ?? []).filter((r) => r.status !== "pending").map((r) => <li key={r.id}><span><strong>{r.kind === "skip" ? "Spring over" : `Flyt${r.wish_date ? ` til ${new Date(`${r.wish_date}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}` : ""}`}</strong><small>{new Date(r.created_at).toLocaleDateString("da-DK")}{r.note ? ` · ${r.note}` : ""}</small></span><b><span className={`pt-pill a-${r.status}`}>{statusText[r.status]}</span></b></li>)}
          </ul>
        </section>
      )}
    </main>
  )
}
