import Link from "next/link"
import { AlertTriangle, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { listStaff } from "@/lib/backend/staff"
import { entryDurationMs, entryFarAway, entryPlace, loadTimeEntries } from "@/lib/backend/time-entries"
import { addDays, copenhagenToIso, dayKey, formatDuration, formatTime, mondayOf, todayLocal, weekNumber } from "@/lib/time"
import { approveEntries, correctEntry } from "./actions"

export const dynamic = "force-dynamic"

export default async function HoursPage({ searchParams }: { searchParams: Promise<{ uge?: string; periode?: string; medarbejder?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/timer")
  const sp = await searchParams
  const today = todayLocal()
  const monthMode = sp.periode === "maaned"
  const anchor = sp.uge && /^\d{4}-\d{2}-\d{2}$/.test(sp.uge) ? sp.uge : today
  const start = monthMode ? `${anchor.slice(0, 7)}-01` : mondayOf(anchor)
  const nextStart = monthMode ? (() => { const d = new Date(`${start}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10) })() : addDays(start, 7)
  const prevStart = monthMode ? (() => { const d = new Date(`${start}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10) })() : addDays(start, -7)
  const label = monthMode ? new Date(`${start}T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric" }) : `Uge ${weekNumber(start)}`

  const [{ entries, error }, { staff }] = await Promise.all([
    loadTimeEntries(org.id, copenhagenToIso(start, "00:00")!, copenhagenToIso(nextStart, "00:00")!, sp.medarbejder || undefined),
    listStaff(org.id),
  ])
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const totals = new Map<string, number>()
  for (const e of entries) totals.set(e.employee_id, (totals.get(e.employee_id) ?? 0) + entryDurationMs(e))
  const flagged = entries.filter(entryFarAway).length
  const open = entries.filter((e) => !e.check_out_at)
  const unapproved = entries.filter((e) => e.check_out_at && !(e as unknown as { approved_at: string | null }).approved_at).length
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(monthMode ? { periode: "maaned" } : {}), ...(sp.medarbejder ? { medarbejder: sp.medarbejder } : {}), ...extra }).toString()
  const exportUrl = `/api/admin/timer-csv?fra=${start}&til=${nextStart}${sp.medarbejder ? `&medarbejder=${sp.medarbejder}` : ""}`

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <p className="admin-eyebrow">{org.name} / Timer</p>
        <div className="admin-workspace-heading">
          <div><h1>Timer</h1><p>{label} · {entries.length} registreringer{flagged ? ` · ${flagged} tjekket ind langt fra stedet` : ""}</p></div>
          <div className="admin-week-nav">
            <Link href={`?${qs({ uge: prevStart })}`} aria-label="Forrige periode"><ChevronLeft className="size-4" /></Link>
            <Link href={`?${qs({ uge: today })}`}>Nu</Link>
            <Link href={`?${qs({ uge: nextStart })}`} aria-label="Næste periode"><ChevronRight className="size-4" /></Link>
            <a href={exportUrl} className="admin-primary"><Download className="size-4" /> Excel</a>
            <form action={approveEntries}><input type="hidden" name="from" value={start} /><input type="hidden" name="to" value={nextStart} />{sp.medarbejder && <input type="hidden" name="employee" value={sp.medarbejder} />}<button type="submit" className="admin-primary">✓ Godkend {unapproved} timer</button></form>
            <Link href={`/admin/loen?fra=${start}&til=${nextStart}`}>Løn</Link>
          </div>
        </div>

        <nav className="admin-tabs" aria-label="Periode og medarbejder">
          <Link href={`?uge=${start}${sp.medarbejder ? `&medarbejder=${sp.medarbejder}` : ""}`} aria-current={!monthMode ? "page" : undefined}>Uge</Link>
          <Link href={`?periode=maaned&uge=${start}${sp.medarbejder ? `&medarbejder=${sp.medarbejder}` : ""}`} aria-current={monthMode ? "page" : undefined}>Måned</Link>
          <Link href={`?${new URLSearchParams({ ...(monthMode ? { periode: "maaned" } : {}), uge: start }).toString()}`} aria-current={!sp.medarbejder ? "page" : undefined}>Alle</Link>
          {staff.map((s) => <Link key={s.id} href={`?${qs({ uge: start, medarbejder: s.id })}`} aria-current={sp.medarbejder === s.id ? "page" : undefined}>{s.name.split(" ")[0]}</Link>)}
        </nav>

        {error && <p className="admin-notice is-error" role="alert">{error}</p>}
        {open.length > 0 && <p className="admin-notice">Tjekket ind nu: {open.map((e) => `${names.get(e.employee_id) ?? "?"} (${entryPlace(e)}, siden ${formatTime(e.check_in_at)})`).join(" · ")}</p>}

        <section className="admin-metrics" aria-label="Timer pr. medarbejder">
          {[...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id, ms]) => (
            <article className="admin-metric" key={id}><strong>{formatDuration(ms).replace(" min", "m").replace(" t ", "t ")}</strong><span>{names.get(id) ?? "Ukendt"}</span></article>
          ))}
          {!totals.size && <article className="admin-metric"><strong>0</strong><span>Ingen timer i perioden</span></article>}
        </section>

        <div className="admin-mail-list">
          {entries.map((e) => (
            <details key={e.id} className={`admin-location${entryFarAway(e) ? " is-flagged" : ""}`}>
              <summary>
                <div>
                  <strong>{names.get(e.employee_id) ?? "Ukendt"} · {entryPlace(e)}</strong>
                  <small>{new Date(e.check_in_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })} · {formatTime(e.check_in_at)}–{e.check_out_at ? formatTime(e.check_out_at) : "nu"} · {formatDuration(entryDurationMs(e))}</small>
                </div>
                {(e as unknown as { approved_at: string | null }).approved_at ? <span className="admin-badge status-won">✓ Godkendt</span> : e.check_out_at ? <span className="admin-badge">Ikke godkendt</span> : null}
                {entryFarAway(e) && <span className="admin-badge status-new"><AlertTriangle className="size-3 inline" aria-hidden="true" /> {Math.max(e.check_in_distance_m ?? 0, e.check_out_distance_m ?? 0)} m fra stedet</span>}
              </summary>
              <div className="admin-location-body">
                <p className="admin-form-hint">Ind: {e.check_in_distance_m !== null ? `${e.check_in_distance_m} m fra stedet` : "ingen position"}{e.check_in_accuracy_m ? ` (GPS ±${Math.round(e.check_in_accuracy_m)} m)` : ""} · Ud: {e.check_out_at ? (e.check_out_distance_m !== null ? `${e.check_out_distance_m} m fra stedet` : "ingen position") : "ikke tjekket ud"}</p>
                {e.note && <p className="admin-job-notes is-employee">{e.note}</p>}
                <form action={correctEntry} className="admin-form-grid">
                  <input type="hidden" name="id" value={e.id} />
                  <label>Dato<input name="date" type="date" defaultValue={dayKey(e.check_in_at)} /></label>
                  <div className="admin-form-row"><label>Ind<input name="check_in" type="time" defaultValue={formatTime(e.check_in_at)} /></label><label>Ud<input name="check_out" type="time" defaultValue={e.check_out_at ? formatTime(e.check_out_at) : ""} /></label></div>
                  <div className="admin-form-row"><label>Pause (min)<input name="break_min" type="number" min={0} max={240} defaultValue={(e as unknown as { break_min: number }).break_min ?? 0} /></label><label>Kørsel (km)<input name="km" inputMode="decimal" defaultValue={String((e as unknown as { km: number }).km ?? 0)} /></label></div>
                  <label className="span-2">Note<input name="note" placeholder="Fx rettet: glemte at tjekke ud" /></label>
                  <label className="admin-check-row span-2"><input type="checkbox" name="approve" defaultChecked /> Godkend timerne</label>
                  <div className="admin-form-actions span-2"><button type="submit">Gem rettelse</button></div>
                </form>
              </div>
            </details>
          ))}
          {!entries.length && !error && <div className="admin-empty-state admin-empty-state-compact"><strong>0</strong><span>registreringer</span><p>Når medarbejderne tjekker ind på vagterne, vises timerne her.</p></div>}
        </div>
      </div>
    </main>
  )
}
