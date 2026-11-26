import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { todayLocal } from "@/lib/time"
import { cancelAbsence, requestAbsence } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fravær" }

const kindLabels: Record<string, string> = { vacation: "Ferie / fri", sick: "Sygdom", child_sick: "Barns sygedag", other: "Andet" }
const statusLabels: Record<string, string> = { pending: "Afventer", approved: "Godkendt", declined: "Afvist" }
const d = (v: string) => new Date(`${v}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

export default async function AbsencePage({ searchParams }: { searchParams: Promise<{ fejl?: string }> }) {
  const p = await employeePortal("/medarbejder/fravaer")
  const sp = await searchParams
  const today = todayLocal()
  const { data: rows } = await createAdminClient().from("employee_absences").select("id, kind, starts_on, ends_on, note, status").eq("org_id", p.org.id).eq("employee_id", p.userId).order("starts_on", { ascending: false }).limit(50)
  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Fravær og ferie</h1><p>Sygdom registreres med det samme. Ferie og fri sendes til godkendelse.</p></header>
      {sp.fejl && <p className="field-err" role="alert">{sp.fejl}</p>}
      <form action={requestAbsence} className="pt-card field-form">
        <div className="pt-seg-radio" role="radiogroup" aria-label="Type">
          {Object.entries(kindLabels).map(([v, l], i) => <label key={v}><input type="radio" name="kind" value={v} defaultChecked={i === 0} /><span>{l}</span></label>)}
        </div>
        <div className="pt-two">
          <label className="field-label">Fra<input type="date" name="starts_on" required defaultValue={today} min={today} /></label>
          <label className="field-label">Til og med<input type="date" name="ends_on" defaultValue={today} min={today} /></label>
        </div>
        <label className="field-label">Bemærkning<textarea name="note" rows={2} placeholder="Valgfri" /></label>
        <button type="submit" className="field-btn field-btn-primary">Send</button>
      </form>
      <section className="pt-card">
        <h2>Mine registreringer</h2>
        <ul className="pt-mini">
          {(rows ?? []).map((r) => (
            <li key={r.id}>
              <span><strong>{kindLabels[r.kind]}</strong><small>{d(r.starts_on)}{r.ends_on !== r.starts_on ? ` – ${d(r.ends_on)}` : ""}{r.note ? ` · ${r.note}` : ""}</small></span>
              <span className="pt-inline"><span className={`pt-pill a-${r.status}`}>{statusLabels[r.status]}</span>{r.status === "pending" && <form action={cancelAbsence}><input type="hidden" name="id" value={r.id} /><button type="submit" className="pt-linkbtn">Træk tilbage</button></form>}</span>
            </li>
          ))}
          {!rows?.length && <li className="pt-muted">Ingen registreringer.</li>}
        </ul>
      </section>
    </main>
  )
}
