import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { loadShifts, type Shift } from "@/lib/backend/shifts"
import { addDays, copenhagenToIso, dayKey, formatDay, mondayOf, todayLocal, weekNumber } from "@/lib/time"
import { ClaimButton } from "@/components/employee-shift-actions"
import ShiftCard from "@/components/shift-card"

export const dynamic = "force-dynamic"
export const metadata = { title: "Vagter" }

export default async function EmployeeShifts({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const p = await employeePortal("/medarbejder/vagter")
  const { vis = "mine" } = await searchParams
  const { org, userId, preview } = p
  const today = todayLocal()
  const from = copenhagenToIso(today, "00:00")!
  const to = copenhagenToIso(addDays(today, 60), "00:00")!
  const db = createAdminClient()
  const [{ data: assignments }, { data: absences }] = await Promise.all([
    db.from("job_assignments").select("job_id").eq("org_id", org.id).eq("employee_id", userId),
    db.from("employee_absences").select("starts_on, ends_on, status").eq("org_id", org.id).eq("employee_id", userId).neq("status", "declined").gte("ends_on", today),
  ])
  const myIds = (assignments ?? []).map((a) => String(a.job_id))
  const list = vis === "ledige"
    ? (await loadShifts(org.id, new Date().toISOString(), to, { onlyOpen: true })).shifts.filter((s) => !s.employeeIds.includes(userId) && s.employeeIds.length < s.max_staff)
    : (await loadShifts(org.id, from, to, { onlyIds: myIds })).shifts.filter((s) => s.status !== "cancelled")
  const weeks = new Map<string, Shift[]>()
  for (const s of list) if (s.scheduled_start) { const w = mondayOf(dayKey(s.scheduled_start)); weeks.set(w, [...(weeks.get(w) ?? []), s]) }
  const off = (day: string) => (absences ?? []).some((a) => a.starts_on <= day && a.ends_on >= day)
  const hours = list.reduce((s, x) => s + (x.scheduled_start && x.scheduled_end ? (new Date(x.scheduled_end).getTime() - new Date(x.scheduled_start).getTime()) / 3600000 : 0), 0)

  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Vagter</h1><p>{vis === "ledige" ? `${list.length} ledige vagter de næste 60 dage` : `${list.length} vagter · ca. ${Math.round(hours)} timer de næste 60 dage`}</p></header>
      <nav className="pt-seg" aria-label="Visning">
        <Link href="?vis=mine" aria-current={vis !== "ledige" ? "page" : undefined}>Mine vagter</Link>
        <Link href="?vis=ledige" aria-current={vis === "ledige" ? "page" : undefined}>Ledige vagter</Link>
      </nav>
      {[...weeks.entries()].map(([w, shifts]) => (
        <section key={w} className="pt-section">
          <h2>Uge {weekNumber(w)} <small>{new Date(`${w}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "UTC" })}–{new Date(`${addDays(w, 6)}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "UTC" })}</small></h2>
          <div className="pt-pairs">
            {shifts.map((s) => (
              <div key={s.id} className="pt-dayblock">
                <p className="pt-day">{formatDay(s.scheduled_start!)}{off(dayKey(s.scheduled_start!)) ? <span className="pt-pill s-cancelled">Fravær</span> : null}</p>
                <ShiftCard shift={s}>
                  {vis === "ledige" && !preview && <div className="pt-actions"><ClaimButton jobId={s.id} /><span className="pt-muted">{s.max_staff - s.employeeIds.length} ledig{s.max_staff - s.employeeIds.length === 1 ? "" : "e"} plads{s.max_staff - s.employeeIds.length === 1 ? "" : "er"}</span></div>}
                </ShiftCard>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!list.length && <p className="pt-empty">{vis === "ledige" ? "Der er ingen ledige vagter lige nu." : <>Du har ingen vagter de næste 60 dage. <Link href="?vis=ledige">Se ledige vagter</Link></>}</p>}
    </main>
  )
}
