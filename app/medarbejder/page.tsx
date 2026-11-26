import Link from "next/link"
import { CalendarOff, ClipboardList, Clock, PackageOpen } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { loadShifts, shiftName } from "@/lib/backend/shifts"
import { addDays, copenhagenToIso, formatDay, formatDuration, formatTime, todayLocal } from "@/lib/time"
import { CheckInButton, CheckOutForm } from "@/components/employee-shift-actions"
import ShiftCard from "@/components/shift-card"

export const dynamic = "force-dynamic"
export const metadata = { title: "I dag" }

function greeting() {
  const h = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", hour12: false, timeZone: "Europe/Copenhagen" }).format(new Date()))
  return h < 10 ? "Godmorgen" : h < 18 ? "Goddag" : "Godaften"
}

export default async function EmployeeToday({ searchParams }: { searchParams: Promise<{ rapport?: string; mangler?: string; fravaer?: string }> }) {
  const p = await employeePortal()
  const sp = await searchParams
  const { org, userId, preview } = p
  const db = createAdminClient()
  const today = todayLocal()
  const [{ data: openEntry }, { data: assignments }, { data: reports }, { count: pendingAbs }, { count: openReq }] = await Promise.all([
    db.from("time_entries").select("id, job_id, check_in_at").eq("org_id", org.id).eq("employee_id", userId).is("check_out_at", null).maybeSingle(),
    db.from("job_assignments").select("job_id").eq("org_id", org.id).eq("employee_id", userId),
    db.from("cleaning_reports").select("job_id, status").eq("org_id", org.id).eq("employee_id", userId).gte("created_at", new Date(Date.now() - 3 * 86400000).toISOString()),
    db.from("employee_absences").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("employee_id", userId).eq("status", "pending"),
    db.from("supply_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("employee_id", userId).neq("status", "done"),
  ])
  const myIds = (assignments ?? []).map((a) => String(a.job_id))
  const { shifts } = await loadShifts(org.id, copenhagenToIso(addDays(today, -1), "00:00")!, copenhagenToIso(addDays(today, 30), "00:00")!, { onlyIds: myIds })
  const mine = shifts.filter((s) => s.status !== "cancelled")
  const todays = mine.filter((s) => s.scheduled_start && new Date(s.scheduled_start).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }) === today)
  const next = mine.find((s) => s.scheduled_start && new Date(s.scheduled_start).getTime() > Date.now() && !todays.includes(s))
  const reportStatus = new Map((reports ?? []).map((r) => [String(r.job_id), r.status]))
  const current = openEntry ? mine.find((s) => s.id === openEntry.job_id) : undefined
  const missingReports = mine.filter((s) => s.scheduled_start && new Date(s.scheduled_start).getTime() < Date.now() && new Date(s.scheduled_start).getTime() > Date.now() - 2 * 86400000 && reportStatus.get(s.id) !== "submitted" && (s.status === "completed" || s.status === "in_progress"))

  return (
    <main className="pt-page">
      <section className="pt-hello">
        <p>{new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Copenhagen" })}</p>
        <h1>{greeting()}, {p.name.split(" ")[0]}</h1>
        <span>{todays.length ? `Du har ${todays.length} vagt${todays.length === 1 ? "" : "er"} i dag.` : "Ingen vagter i dag."}</span>
      </section>
      {sp.rapport && <p className="field-ok" role="status">Tak! Rapporten er sendt.</p>}
      {sp.mangler && <p className="field-ok" role="status">Beskeden er sendt til kontoret.</p>}
      {sp.fravaer && <p className="field-ok" role="status">Dit fravær er sendt til godkendelse.</p>}

      {openEntry && (
        <section className="pt-live">
          <div className="pt-live-head"><span className="pt-dot" /> <strong>Tjekket ind</strong> siden {formatTime(openEntry.check_in_at)} · {formatDuration(Date.now() - new Date(openEntry.check_in_at).getTime())}</div>
          {current && <p className="pt-live-place">{shiftName(current)}</p>}
          {openEntry.job_id && <Link href={`/medarbejder/rapport/${openEntry.job_id}`} className="field-btn field-btn-primary"><ClipboardList className="size-5" /> Udfyld rengøringsrapport</Link>}
          {!preview && <CheckOutForm entryId={String(openEntry.id)} />}
        </section>
      )}

      <div className="pt-quick">
        <Link href="/medarbejder/mangler"><PackageOpen className="size-6" /><span>Mangler noget</span>{openReq ? <b>{openReq}</b> : null}</Link>
        <Link href="/medarbejder/fravaer"><CalendarOff className="size-6" /><span>Meld fravær</span>{pendingAbs ? <b>{pendingAbs}</b> : null}</Link>
        <Link href="/medarbejder/vagter?vis=ledige"><ClipboardList className="size-6" /><span>Ledige vagter</span></Link>
        <Link href="/medarbejder/timer"><Clock className="size-6" /><span>Mine timer</span></Link>
      </div>

      {missingReports.length > 0 && (
        <section className="pt-card pt-warn">
          <h2>Mangler rapport</h2>
          <ul className="pt-mini">{missingReports.map((s) => <li key={s.id}><span>{shiftName(s)} · {formatDay(s.scheduled_start!)}</span><Link href={`/medarbejder/rapport/${s.id}`}>Udfyld</Link></li>)}</ul>
        </section>
      )}

      <section className="pt-section">
        <h2>I dag</h2>
        {todays.length ? (
          <div className="pt-pairs">
            {todays.map((s) => {
              const isCurrent = openEntry?.job_id === s.id
              const canCheckIn = !openEntry && s.status !== "completed"
              const rs = reportStatus.get(s.id)
              return (
                <ShiftCard key={s.id} shift={s} highlight={isCurrent}>
                  <div className="pt-actions">
                    {canCheckIn && !preview && <CheckInButton jobId={s.id} />}
                    <Link href={`/medarbejder/rapport/${s.id}`} className="field-btn">{rs === "submitted" ? "Se rapport" : "Rengøringsrapport"}</Link>
                  </div>
                </ShiftCard>
              )
            })}
          </div>
        ) : <p className="pt-empty">Ingen vagter i dag.{next ? "" : " "}<Link href="/medarbejder/vagter?vis=ledige">Se ledige vagter</Link></p>}
      </section>

      {next && (
        <section className="pt-section">
          <h2>Næste vagt · {formatDay(next.scheduled_start!)}</h2>
          <ShiftCard shift={next} />
        </section>
      )}
    </main>
  )
}
