import Link from "next/link"
import { CalendarOff, ClipboardList, MessageCircle, Navigation, PackageOpen, Sparkles } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { loadShifts, shiftAddress, shiftName, type Shift } from "@/lib/backend/shifts"
import { memberUnread } from "@/lib/backend/chat"
import { addDays, copenhagenToIso, dayKey, formatDay, formatTime, todayLocal } from "@/lib/time"
import { CheckOutForm } from "@/components/employee-shift-actions"
import SlideCheckIn from "@/components/slide-check-in"
import { Countdown, Elapsed } from "@/components/live-clock"

export const dynamic = "force-dynamic"
export const metadata = { title: "I dag" }

function greeting() {
  const h = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", hour12: false, timeZone: "Europe/Copenhagen" }).format(new Date()))
  return h < 5 ? "God nat" : h < 10 ? "Godmorgen" : h < 18 ? "Goddag" : "Godaften"
}

export default async function EmployeeToday({ searchParams }: { searchParams: Promise<{ rapport?: string; mangler?: string; fravaer?: string; dag?: string }> }) {
  const p = await employeePortal()
  const sp = await searchParams
  const { org, userId, preview } = p
  const db = createAdminClient()
  const today = todayLocal()
  const day = sp.dag && /^\d{4}-\d{2}-\d{2}$/.test(sp.dag) ? sp.dag : today
  const [{ data: openEntry }, { data: assignments }, { data: reports }, { count: openReq }, { data: absences }, unread, { count: handovers }] = await Promise.all([
    db.from("time_entries").select("id, job_id, check_in_at").eq("org_id", org.id).eq("employee_id", userId).is("check_out_at", null).maybeSingle(),
    db.from("job_assignments").select("job_id").eq("org_id", org.id).eq("employee_id", userId),
    db.from("cleaning_reports").select("job_id, status").eq("org_id", org.id).eq("employee_id", userId).gte("created_at", new Date(Date.now() - 4 * 86400000).toISOString()),
    db.from("supply_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("employee_id", userId).neq("status", "done"),
    db.from("employee_absences").select("starts_on, ends_on").eq("org_id", org.id).eq("employee_id", userId).eq("status", "approved").gte("ends_on", today),
    memberUnread(org.id, "employee", userId),
    db.from("shift_handovers").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "open").neq("employee_id", userId),
  ])
  const myIds = (assignments ?? []).map((a) => String(a.job_id))
  const { shifts } = await loadShifts(org.id, copenhagenToIso(addDays(today, -2), "00:00")!, copenhagenToIso(addDays(today, 30), "00:00")!, { onlyIds: myIds })
  const mine = shifts.filter((s) => s.status !== "cancelled" && s.scheduled_start)
  const onDay = (d: string) => mine.filter((s) => dayKey(s.scheduled_start!) === d)
  const todays = onDay(today)
  const selected = onDay(day)
  const reportStatus = new Map((reports ?? []).map((r) => [String(r.job_id), r.status]))
  const current = openEntry ? mine.find((s) => s.id === openEntry.job_id) : undefined
  const nextToday = todays.find((s) => s.status === "scheduled" && new Date(s.scheduled_end ?? s.scheduled_start!).getTime() > Date.now())
  const nextAny = mine.find((s) => new Date(s.scheduled_start!).getTime() > Date.now() && s.status === "scheduled")
  const missingReports = mine.filter((s) => new Date(s.scheduled_start!).getTime() < Date.now() && new Date(s.scheduled_start!).getTime() > Date.now() - 2 * 86400000 && reportStatus.get(s.id) !== "submitted" && (s.status === "completed" || s.status === "in_progress") && s.id !== openEntry?.job_id)
  const off = (d: string) => (absences ?? []).some((a) => a.starts_on <= d && a.ends_on >= d)
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const hoursToday = todays.reduce((t, s) => t + (s.scheduled_end ? (new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start!).getTime()) / 3600000 : 0), 0)
  const first = p.name.split(" ")[0]

  const card = (s: Shift) => {
    const isNow = openEntry?.job_id === s.id
    const rs = reportStatus.get(s.id)
    return (
      <li key={s.id}>
        <span className="tl-time">{formatTime(s.scheduled_start!)}{s.scheduled_end && <small>{formatTime(s.scheduled_end)}</small>}</span>
        <Link href={`/medarbejder/vagt/${s.id}`} className={`tl-card${isNow ? " is-now" : ""}${s.status === "completed" ? " is-done" : ""}`}>
          <strong>{shiftName(s)}</strong>
          {shiftAddress(s) && <small>{shiftAddress(s)}</small>}
          <span className="tl-tags">
            {isNow && <span className="pt-pill s-in_progress">I gang</span>}
            {s.status === "completed" && <span className="pt-pill s-completed">Udført</span>}
            {rs === "submitted" ? <span className="pt-pill s-done">Rapport sendt</span> : s.status !== "scheduled" ? <span className="pt-pill a-pending">Rapport mangler</span> : null}
            {s.employeeIds.length > 1 && <span className="pt-pill">+{s.employeeIds.length - 1} kollega{s.employeeIds.length > 2 ? "er" : ""}</span>}
            {s.location?.access_notes && <span className="pt-pill">🔑 Adgang</span>}
          </span>
        </Link>
      </li>
    )
  }

  return (
    <main className="pt-page">
      {sp.rapport && <p className="field-ok" role="status">Tak! Rapporten er sendt.</p>}
      {sp.mangler && <p className="field-ok" role="status">Beskeden er sendt til kontoret.</p>}
      {sp.fravaer && <p className="field-ok" role="status">Dit fravær er registreret.</p>}

      {openEntry ? (
        <section className="hero">
          <span className="hero-chip"><span className="pt-dot" /> Du er i gang</span>
          <h1>{current ? shiftName(current) : "Tjekket ind"}</h1>
          <div className="hero-big"><Elapsed since={openEntry.check_in_at} /></div>
          <span className="hero-sub">Tjekket ind kl. {formatTime(openEntry.check_in_at)}{current?.scheduled_end ? ` · slutter ${formatTime(current.scheduled_end)}` : ""}</span>
          <div className="hero-row">
            {openEntry.job_id && <Link href={`/medarbejder/rapport/${openEntry.job_id}`} className="field-btn field-btn-primary"><ClipboardList className="size-5" /> Rengøringsrapport</Link>}
            {current && shiftAddress(current) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shiftAddress(current)!)}`} target="_blank" rel="noreferrer" className="field-btn">Kort</a>}
          </div>
          {!preview && <CheckOutForm entryId={String(openEntry.id)} />}
        </section>
      ) : nextToday ? (
        <section className="hero">
          <p>{greeting()}, {first}</p>
          <h1>{shiftName(nextToday)}</h1>
          <span className="hero-sub">{formatTime(nextToday.scheduled_start!)}{nextToday.scheduled_end ? `–${formatTime(nextToday.scheduled_end)}` : ""} · {new Date(nextToday.scheduled_start!).getTime() > Date.now() ? <Countdown until={nextToday.scheduled_start!} prefix="starter om" /> : "i gang nu"}</span>
          {shiftAddress(nextToday) && <span className="hero-sub">📍 {shiftAddress(nextToday)}</span>}
          {!preview && <SlideCheckIn jobId={nextToday.id} />}
          <div className="hero-row">
            {shiftAddress(nextToday) && <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(shiftAddress(nextToday)!)}`} target="_blank" rel="noreferrer" className="field-btn"><Navigation className="size-5" /> Vis vej</a>}
            <Link href={`/medarbejder/vagt/${nextToday.id}`} className="field-btn">Detaljer</Link>
          </div>
        </section>
      ) : (
        <section className="hero">
          <p>{new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Copenhagen" })}</p>
          <h1>{greeting()}, {first} <Sparkles className="size-6 inline" /></h1>
          <span className="hero-sub">{todays.length ? `Dagens ${todays.length === 1 ? "vagt er" : "vagter er"} klaret – godt arbejde!` : "Ingen vagter i dag."}{nextAny ? <> Næste vagt: <strong>{formatDay(nextAny.scheduled_start!)} kl. {formatTime(nextAny.scheduled_start!)}</strong> (<Countdown until={nextAny.scheduled_start!} />).</> : ""}</span>
          <div className="hero-row">
            {nextAny && <Link href={`/medarbejder/vagt/${nextAny.id}`} className="field-btn field-btn-primary">Se næste vagt</Link>}
            <Link href="/medarbejder/vagter?vis=ledige" className="field-btn">Ledige vagter{handovers ? ` (${handovers} til overtagelse)` : ""}</Link>
          </div>
        </section>
      )}

      {missingReports.length > 0 && (
        <section className="pt-card pt-warn">
          <h2>Mangler rapport</h2>
          <ul className="pt-mini">{missingReports.map((s) => <li key={s.id}><span><strong>{shiftName(s)}</strong><small>{formatDay(s.scheduled_start!)}</small></span><Link href={`/medarbejder/rapport/${s.id}`} className="pt-link">Udfyld nu</Link></li>)}</ul>
        </section>
      )}

      <div className="pt-quick">
        <Link href="/medarbejder/beskeder"><MessageCircle className="size-6" /><span>Beskeder</span>{unread ? <b>{unread}</b> : null}</Link>
        <Link href="/medarbejder/rute"><Navigation className="size-6" /><span>Dagens rute</span></Link>
        <Link href="/medarbejder/mangler"><PackageOpen className="size-6" /><span>Mangler noget</span>{openReq ? <b>{openReq}</b> : null}</Link>
        <Link href="/medarbejder/fravaer"><CalendarOff className="size-6" /><span>Meld fravær</span></Link>
      </div>

      <section className="pt-section">
        <h2>Din uge <small>{hoursToday ? `${Math.round(hoursToday * 10) / 10} t i dag` : ""}</small></h2>
        <nav className="wk" aria-label="Vælg dag">
          {week.map((d) => {
            const n = onDay(d).length
            return (
              <Link key={d} href={d === today ? "/medarbejder" : `/medarbejder?dag=${d}`} aria-current={d === day ? "page" : undefined} className={d === today ? "is-today" : ""}>
                <small>{new Date(`${d}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", timeZone: "UTC" }).replace(".", "")}</small>
                <strong>{Number(d.slice(8))}</strong>
                <i>{off(d) ? <b className="is-off" /> : Array.from({ length: Math.min(n, 3) }, (_, i) => <b key={i} />)}</i>
              </Link>
            )
          })}
        </nav>
        {off(day) && <p className="pt-muted">Du har fravær denne dag.</p>}
        {selected.length ? <ul className="tl">{selected.map(card)}</ul> : <p className="pt-empty">{day === today ? "Ingen vagter i dag." : "Ingen vagter denne dag."} <Link href="/medarbejder/vagter?vis=ledige" className="pt-link">Se ledige vagter</Link></p>}
      </section>
    </main>
  )
}
