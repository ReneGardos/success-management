import Link from "next/link"
import { ChevronLeft, ChevronRight, MapPin, Users, X } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { listStaff } from "@/lib/backend/staff"
import { loadLocations, loadShifts, shiftAddress, shiftName, type Shift } from "@/lib/backend/shifts"
import { createAdminClient } from "@/lib/supabase/admin"
import { mapsLink } from "@/lib/geo"
import { addDays, copenhagenToIso, dayKey, formatTime, mondayOf, todayLocal, weekNumber } from "@/lib/time"
import ShiftCalendar, { type CalendarDay, type CalendarShift } from "@/components/shift-calendar"
import ShiftBoard, { type BoardShift } from "@/components/shift-board"

import { deleteShift, updateShift } from "./actions"

// One colour per employee; the organization's own colours come first.
const baseColors = ["#244963", "#927039", "#A33A32", "#5B7C99", "#7A6A8E", "#3E7C74", "#B5835A", "#4B5563"]

export const dynamic = "force-dynamic"

const statusLabels: Record<string, string> = { scheduled: "Planlagt", in_progress: "I gang", completed: "Udført", cancelled: "Aflyst" }
const isDay = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v))
const localTime = (iso: string | null) => (iso ? formatTime(iso) : "")
const monthLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: "UTC" })
function shiftMonth(day: string, n: number) {
  const d = new Date(`${day.slice(0, 7)}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

type SP = { visning?: string; dato?: string; vagt?: string; ny?: string; fejl?: string; oprettet?: string; gemt?: string; slettet?: string; tildelt?: string; medarbejder?: string }

export default async function ShiftPlanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { org } = await requireRolePage(["admin"], "/admin/vagtplan")
  const sp = await searchParams
  const today = todayLocal()
  const view: "week" | "month" | "board" = sp.visning === "uge" ? "week" : sp.visning === "maaned" || sp.ny ? "month" : "board"
  const vis = view === "week" ? "uge" : view === "board" ? "tavle" : "maaned"
  const anchor = isDay(sp.dato) ? sp.dato! : today

  // Visible range: a full month grid (Mon–Sun, 6 weeks) or one week.
  const monthStart = `${anchor.slice(0, 7)}-01`
  const gridStart = view === "month" ? mondayOf(monthStart) : mondayOf(anchor)
  const dayCount = view === "month" ? 42 : 7
  const days: CalendarDay[] = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(gridStart, i)
    return { date, inMonth: view !== "month" || date.slice(0, 7) === anchor.slice(0, 7), isToday: date === today }
  })
  const from = copenhagenToIso(gridStart, "00:00")!
  const to = copenhagenToIso(addDays(gridStart, dayCount), "00:00")!

  const [{ shifts, error }, { staff }, { locations }] = await Promise.all([loadShifts(org.id, from, to), listStaff(org.id), loadLocations(org.id)])
  const staffColors = [org.color_primary, org.color_accent, org.color_muted, ...baseColors]
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const colorOf = new Map(staff.map((s, i) => [s.id, staffColors[i % staffColors.length]]))
  const focus = sp.medarbejder && names.has(sp.medarbejder) ? sp.medarbejder : ""
  const { data: openEntries } = await createAdminClient().from("time_entries").select("job_id, employee_id").eq("org_id", org.id).is("check_out_at", null)
  const checkedIn = new Set((openEntries ?? []).map((e) => `${e.job_id}|${e.employee_id}`))
  const { data: absences } = await createAdminClient().from("employee_absences").select("employee_id, kind, starts_on, ends_on, status").eq("org_id", org.id).in("status", ["approved", "pending"]).lte("starts_on", addDays(gridStart, dayCount - 1)).gte("ends_on", gridStart).order("starts_on")
  const absentOn = (emp: string, day: string) => (absences ?? []).some((a) => a.status === "approved" && a.employee_id === emp && a.starts_on <= day && a.ends_on >= day)
  const conflicts = shifts.filter((s) => s.scheduled_start && s.status !== "cancelled" && s.employeeIds.some((e) => absentOn(e, dayKey(s.scheduled_start!))))
  const pendingAbs = (absences ?? []).filter((a) => a.status === "pending").length
  const { data: offers } = await createAdminClient().from("shift_handovers").select("job_id, employee_id").eq("org_id", org.id).eq("status", "open")

  const byDay: Record<string, CalendarShift[]> = {}
  for (const s of shifts) {
    if (!s.scheduled_start) continue
    if (focus && !s.employeeIds.includes(focus) && !(s.is_open && s.employeeIds.length < s.max_staff)) continue
    const key = dayKey(s.scheduled_start)
    ;(byDay[key] ??= []).push({
      id: s.id,
      time: `${localTime(s.scheduled_start)}${s.scheduled_end ? `–${localTime(s.scheduled_end)}` : ""}`,
      name: shiftName(s),
      status: s.status,
      people: s.employeeIds.map((id) => ({ id, name: (names.get(id) ?? "?").split(" ")[0], color: colorOf.get(id) ?? "#697987", in: checkedIn.has(`${s.id}|${id}`) })),
      missing: s.status === "cancelled" ? 0 : Math.max(0, s.max_staff - s.employeeIds.length),
      isOpen: s.is_open,
    })
  }

  const visibleShifts = shifts.filter((s) => s.scheduled_start && days.some((d) => d.inMonth && d.date === dayKey(s.scheduled_start!)))
  const totalHours = visibleShifts.reduce((sum, s) => sum + (s.scheduled_start && s.scheduled_end ? ((new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start).getTime()) / 3600000) * Math.max(1, s.employeeIds.length) : 0), 0)
  const understaffed = visibleShifts.filter((s) => s.status !== "cancelled" && s.employeeIds.length < s.max_staff).length

  const base = `/admin/vagtplan?visning=${vis}&dato=${anchor}${focus ? `&medarbejder=${focus}` : ""}`
  const keep = focus ? `&medarbejder=${focus}` : ""
  const prev = view === "month" ? shiftMonth(anchor, -1) : addDays(anchor, -7)
  const next = view === "month" ? shiftMonth(anchor, 1) : addDays(anchor, 7)
  const title = view === "month" ? monthLabel(anchor) : `Uge ${weekNumber(gridStart)} · ${monthLabel(gridStart)}`
  const selected: Shift | undefined = sp.vagt ? shifts.find((s) => s.id === sp.vagt) : undefined

  // Board (week, one row per person)
  const boardDays = days.map((d) => ({ date: d.date, isToday: d.isToday, label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) }))
  const boardShifts: BoardShift[] = shifts.filter((s) => s.scheduled_start).map((s) => ({
    id: s.id,
    date: dayKey(s.scheduled_start!),
    time: `${localTime(s.scheduled_start)}${s.scheduled_end ? `–${localTime(s.scheduled_end)}` : ""}`,
    hours: s.scheduled_end ? (new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start!).getTime()) / 3600000 : 0,
    name: shiftName(s),
    status: s.status,
    missing: s.status === "cancelled" ? 0 : Math.max(0, s.max_staff - s.employeeIds.length),
    isOpen: s.is_open,
    employeeIds: s.employeeIds,
    checkedIn: s.employeeIds.filter((e) => checkedIn.has(`${s.id}|${e}`)),
  }))
  const absentDays = (emp: string) => days.filter((d) => absentOn(emp, d.date)).map((d) => d.date)
  const inNow = (openEntries ?? []).length
  const openSlots = visibleShifts.filter((s) => s.status !== "cancelled" && s.is_open && s.employeeIds.length < s.max_staff).length

  return (
    <main className="admin-shell">
      <div className="admin-workspace admin-workspace-wide">
        <div className="admin-workspace-heading">
          <div>
            <h1 className="cal-title">Vagtplan · <span>{title}</span></h1>
            <p>{visibleShifts.length} vagter · {Math.round(totalHours)} planlagte timer{understaffed ? ` · ${understaffed} mangler folk` : ""}</p>
          </div>
          <div className="admin-week-nav">
            <div className="cal-switch" role="group" aria-label="Visning">
              <Link href={`?visning=tavle&dato=${anchor}${keep}`} aria-current={view === "board" ? "page" : undefined}>Tavle</Link>
              <Link href={`?visning=maaned&dato=${anchor}${keep}`} aria-current={view === "month" ? "page" : undefined}>Måned</Link>
              <Link href={`?visning=uge&dato=${anchor}${keep}`} aria-current={view === "week" ? "page" : undefined}>Uge</Link>
            </div>
            <Link href={`?visning=${vis}&dato=${prev}${keep}`} aria-label="Forrige"><ChevronLeft className="size-4" /></Link>
            <Link href={`?visning=${vis}&dato=${today}${keep}`}>I dag</Link>
            <Link href={`?visning=${vis}&dato=${next}${keep}`} aria-label="Næste"><ChevronRight className="size-4" /></Link>
          </div>
        </div>

        <section className="vp-kpis">
          <div><small>Vagter</small><strong>{visibleShifts.filter((s) => s.status !== "cancelled").length}</strong></div>
          <div><small>Planlagte timer</small><strong>{Math.round(totalHours)}</strong></div>
          <div className={understaffed ? "is-warn" : ""}><small>Mangler folk</small><strong>{understaffed}</strong></div>
          <div><small>Ledige pladser</small><strong>{openSlots}</strong></div>
          <div><small>Fravær</small><strong>{(absences ?? []).filter((a) => a.status === "approved").length}</strong></div>
          <div className={inNow ? "is-live" : ""}><small>Tjekket ind nu</small><strong>{inNow}</strong></div>
        </section>
        {sp.oprettet && <p className="admin-notice is-ok" role="status">{sp.oprettet} vagt{sp.oprettet === "1" ? "" : "er"} oprettet.</p>}
        {sp.gemt && <p className="admin-notice is-ok" role="status">Vagten er gemt.</p>}
        {sp.tildelt && <p className="admin-notice is-ok" role="status">{sp.tildelt}.</p>}
        {sp.slettet && <p className="admin-notice is-ok" role="status">{sp.slettet} vagt{sp.slettet === "1" ? "" : "er"} slettet.</p>}
        {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}
        {error && <p className="admin-notice is-error" role="alert">{error}</p>}
        {!staff.length && <p className="admin-notice">Der er ingen medarbejdere endnu. <Link href="/admin/brugere">Invitér medarbejdere</Link>.</p>}
        {(absences?.length ?? 0) > 0 && (
          <p className="admin-notice">
            <strong>Fravær i perioden:</strong>{" "}
            {(absences ?? []).filter((a) => a.status === "approved").map((a, i) => <span key={i}>{i ? " · " : ""}{(names.get(a.employee_id) ?? "?").split(" ")[0]} {new Date(`${a.starts_on}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}{a.ends_on !== a.starts_on ? `–${new Date(`${a.ends_on}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}` : ""}</span>)}
            {pendingAbs > 0 && <> · <Link href="/admin/fravaer">{pendingAbs} ansøgning{pendingAbs === 1 ? "" : "er"} venter</Link></>}
          </p>
        )}
        {(offers?.length ?? 0) > 0 && <p className="admin-notice">🔄 {offers!.length} vagt{offers!.length === 1 ? "" : "er"} er sat til overtagelse af medarbejdere: {offers!.slice(0, 4).map((o, i) => { const s = shifts.find((x) => x.id === o.job_id); return <span key={o.job_id}>{i ? ", " : ""}<Link href={`${base}&vagt=${o.job_id}`}>{(names.get(o.employee_id) ?? "?").split(" ")[0]}{s?.scheduled_start ? ` ${new Date(s.scheduled_start).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "short" })}` : ""}</Link></span> })}</p>}
        {conflicts.length > 0 && <p className="admin-notice is-error" role="alert">{conflicts.length} vagt{conflicts.length === 1 ? "" : "er"} har en medarbejder med godkendt fravær: {conflicts.slice(0, 4).map((s, i) => <span key={s.id}>{i ? ", " : ""}<Link href={`${base}&vagt=${s.id}`}>{shiftName(s)} {new Date(s.scheduled_start!).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", day: "numeric", month: "short" })}</Link></span>)}{conflicts.length > 4 ? " …" : ""}</p>}
        {!locations.length && <p className="admin-notice">Tip: <Link href="/admin/steder">Opret jeres steder</Link>, så medarbejderne kan tjekke ind med GPS.</p>}

        {selected && (
          <form action={updateShift} className="admin-form" id="rediger">
            <div className="admin-form-title"><h2>{shiftName(selected)}</h2><Link href={base} aria-label="Luk" scroll={false}><X className="size-4" /></Link></div>
            <input type="hidden" name="id" value={selected.id} />
            <input type="hidden" name="back" value={base} />
            {shiftAddress(selected) && <p className="admin-inline-form"><MapPin className="size-4" aria-hidden="true" /> <a href={mapsLink(shiftAddress(selected))} target="_blank" rel="noreferrer">{shiftAddress(selected)}</a></p>}
            {selected.employee_note && <p className="admin-job-notes is-employee">Medarbejderens note: {selected.employee_note}</p>}
            <div className="admin-form-grid">
              <label className="span-2">Titel<input name="title" defaultValue={selected.title ?? ""} /></label>
              <label>Dato<input name="date" type="date" defaultValue={selected.scheduled_start ? dayKey(selected.scheduled_start) : ""} /></label>
              <div className="admin-form-row"><label>Fra<input name="start" type="time" defaultValue={localTime(selected.scheduled_start)} /></label><label>Til<input name="end" type="time" defaultValue={localTime(selected.scheduled_end)} /></label></div>
              <label>Status<select name="status" defaultValue={selected.status}>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Antal medarbejdere<input name="max_staff" type="number" min={1} max={20} defaultValue={selected.max_staff} /></label>
              {staff.length > 0 && <fieldset className="span-2"><legend><Users className="size-4 inline" aria-hidden="true" /> Medarbejdere på vagten</legend><div className="admin-checks">{staff.map((s) => <label key={s.id}><input type="checkbox" name="employees" value={s.id} defaultChecked={selected.employeeIds.includes(s.id)} /> {s.name}{checkedIn.has(`${selected.id}|${s.id}`) ? " · tjekket ind" : ""}</label>)}</div></fieldset>}
              <label className="admin-check-row span-2"><input type="checkbox" name="is_open" defaultChecked={selected.is_open} /> Ledige pladser kan tages af medarbejderne</label>
              <label className="span-2">Instruktioner<textarea name="notes" rows={3} defaultValue={selected.notes ?? ""} /></label>
              <div className="admin-form-actions span-2"><button type="submit" className="admin-primary">Gem vagt</button></div>
            </div>
          </form>
        )}
        {selected && (
          <form action={deleteShift} className="admin-inline-form admin-delete-row">
            <input type="hidden" name="id" value={selected.id} />
            <input type="hidden" name="back" value={base} />
            <button type="submit" name="scope" value="one">Slet denne vagt</button>
            {selected.series_id && <button type="submit" name="scope" value="series">Slet denne og alle senere i serien</button>}
          </form>
        )}

        {staff.length > 0 && (
          <nav className="cal-filter" aria-label="Vis medarbejder">
            <span>Vis:</span>
            <Link href={`?visning=${vis}&dato=${anchor}`} aria-current={!focus ? "page" : undefined}>Alle</Link>
            {staff.map((p) => (
              <Link key={p.id} href={`?visning=${vis}&dato=${anchor}&medarbejder=${p.id}`} aria-current={focus === p.id ? "page" : undefined}>
                <i className="cal-swatch" style={{ background: colorOf.get(p.id) }} /> {p.name.split(" ")[0]}
              </Link>
            ))}
          </nav>
        )}

        {view === "board" ? (
          <ShiftBoard
            days={boardDays}
            shifts={boardShifts}
            editHref={`${base}&vagt=`}
            people={staff.filter((p) => !focus || p.id === focus).map((p) => ({ id: p.id, name: p.name, color: colorOf.get(p.id) ?? "#697987", absent: absentDays(p.id) }))}
          />
        ) : (
        <ShiftCalendar
          days={days}
          shifts={byDay}
          view={view}
          key={`${anchor}-${view}-${focus}`}
          editHref={`${base}&vagt=`}
          back={base}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          staff={staff.map((s) => ({ id: s.id, name: s.name, color: colorOf.get(s.id) ?? "#697987" }))}
          focusEmployee={focus}
          initialSelected={sp.ny && isDay(sp.dato) ? [sp.dato!] : sp.ny ? [today] : []}
          today={today}
        />
        )}
        {view !== "board" && <p className="admin-legend">Prikker = medarbejdere (farve pr. person) · <span className="is-in">grøn kant</span> = tjekket ind nu · <span className="is-open">guld</span> = ledig vagt · <span className="is-missing">rød</span> = mangler folk</p>}
      </div>
    </main>
  )
}
