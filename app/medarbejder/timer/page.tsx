import { employeePortal } from "@/lib/portal"
import { entryDurationMs, entryPlace, loadTimeEntries } from "@/lib/backend/time-entries"
import { addDays, copenhagenToIso, dayKey, formatDuration, formatTime, mondayOf, todayLocal, weekNumber } from "@/lib/time"
import { BarChart } from "@/components/charts"

export const dynamic = "force-dynamic"
export const metadata = { title: "Timer" }

export default async function EmployeeHours() {
  const p = await employeePortal("/medarbejder/timer")
  const { org, userId } = p
  const today = todayLocal()
  const weekStart = mondayOf(today)
  const first = addDays(weekStart, -7 * 7)
  const { entries } = await loadTimeEntries(org.id, copenhagenToIso(first, "00:00")!, copenhagenToIso(addDays(today, 1), "00:00")!, userId)
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(first, i * 7))
  const perWeek = weeks.map((w) => entries.filter((e) => mondayOf(dayKey(e.check_in_at)) === w).reduce((s, e) => s + entryDurationMs(e), 0) / 3600000)
  const monthStart = `${today.slice(0, 7)}-01`
  const monthMs = entries.filter((e) => dayKey(e.check_in_at) >= monthStart).reduce((s, e) => s + entryDurationMs(e), 0)
  const weekMs = entries.filter((e) => dayKey(e.check_in_at) >= weekStart).reduce((s, e) => s + entryDurationMs(e), 0)
  const visits = entries.filter((e) => dayKey(e.check_in_at) >= monthStart).length

  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Mine timer</h1><p>Registreret med check-ind og check-ud</p></header>
      <div className="pt-kpis">
        <div><small>Denne uge</small><strong>{formatDuration(weekMs)}</strong></div>
        <div><small>Denne måned</small><strong>{formatDuration(monthMs)}</strong></div>
        <div><small>Besøg i måneden</small><strong>{visits}</strong></div>
        <div><small>Snit pr. uge (8 uger)</small><strong>{(perWeek.reduce((a, b) => a + b, 0) / 8).toLocaleString("da-DK", { maximumFractionDigits: 1 })} t</strong></div>
      </div>
      <section className="pt-card"><h2>Timer pr. uge</h2><BarChart values={perWeek.map((h) => Math.round(h * 10) / 10)} labels={weeks.map((w) => `U${weekNumber(w)}`)} color={org.color_primary} unit=" t" /></section>
      <section className="pt-card">
        <h2>Registreringer</h2>
        <ul className="pt-mini">
          {entries.map((e) => <li key={e.id}><span><strong>{entryPlace(e)}</strong><small>{new Date(e.check_in_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })} · {formatTime(e.check_in_at)}–{e.check_out_at ? formatTime(e.check_out_at) : "nu"}</small></span><b>{formatDuration(entryDurationMs(e))}</b></li>)}
          {!entries.length && <li className="pt-muted">Ingen timer endnu.</li>}
        </ul>
      </section>
    </main>
  )
}
