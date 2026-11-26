"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarPlus, UserPlus, X } from "lucide-react"
import { assignEmployeeToDays, createShifts } from "@/app/admin/vagtplan/actions"
import { expandDates, MAX_OCCURRENCES, repeatOptions, weekdayOrdinal, type RepeatRule } from "@/lib/recurrence"

export type CalendarDay = { date: string; inMonth: boolean; isToday: boolean }
export type CalendarPerson = { id: string; name: string; color: string; in: boolean }
export type CalendarShift = { id: string; time: string; name: string; status: string; people: CalendarPerson[]; missing: number; isOpen: boolean }
export type StaffOption = { id: string; name: string; color: string }

type Props = {
  days: CalendarDay[]
  shifts: Record<string, CalendarShift[]>
  view: "month" | "week"
  editHref: string
  back: string
  locations: { id: string; name: string }[]
  staff: StaffOption[]
  initialSelected?: string[]
  focusEmployee?: string
  today: string
}

const weekdayNames = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"]
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const addMonths = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10) }

type Drag = { anchor: string; last: string; mode: "add" | "remove"; base: Set<string>; active: boolean; startX: number; startY: number; fromLink: boolean }

export default function ShiftCalendar({ days, shifts, view, editHref, back, locations, staff, initialSelected = [], focusEmployee = "", today }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected))
  const [tab, setTab] = useState<"create" | "assign">(focusEmployee ? "assign" : "create")
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)
  const order = useMemo(() => days.map((d) => d.date), [days])
  const [rule, setRule] = useState<RepeatRule>("none")
  const sortedSelected = useMemo(() => [...selected].sort(), [selected])
  const [until, setUntil] = useState(() => addMonths(initialSelected[0] ?? today, 3))
  const [locationId, setLocationId] = useState("")
  const [employeeId, setEmployeeId] = useState(focusEmployee)
  const [submitting, setSubmitting] = useState(false)
  const count = useMemo(() => (sortedSelected.length ? expandDates(sortedSelected, rule, until).length : 0), [sortedSelected, rule, until])
  const shiftsOnSelected = useMemo(() => sortedSelected.reduce((n, d) => n + (shifts[d]?.length ?? 0), 0), [sortedSelected, shifts])

  const applyRange = useCallback((to: string) => {
    const d = drag.current
    if (!d) return
    d.last = to
    const [a, b] = [order.indexOf(d.anchor), order.indexOf(to)].sort((x, y) => x - y)
    const next = new Set(d.base)
    for (const day of order.slice(a, b + 1)) d.mode === "add" ? next.add(day) : next.delete(day)
    setSelected(next)
  }, [order])

  useEffect(() => {
    const dateAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-date]")?.dataset.date
    function move(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return
        d.active = true // the pointer moved: this is a drag, not a click
        if (d.fromLink) suppressClick.current = true
        applyRange(d.anchor)
      }
      if (e.cancelable) e.preventDefault()
      const date = dateAt(e.clientX, e.clientY)
      if (date && date !== d.last) applyRange(date)
    }
    function end() {
      const d = drag.current
      drag.current = null
      if (d && !d.active && !d.fromLink) {
        // plain click / tap on a day toggles it
        setSelected((s) => { const n = new Set(s); n.has(d.anchor) ? n.delete(d.anchor) : n.add(d.anchor); return n })
      }
    }
    const cancel = () => { drag.current = null }
    window.addEventListener("pointermove", move, { passive: false })
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [applyRange])

  function onPointerDown(e: React.PointerEvent, date: string) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest("button")) return
    const fromLink = Boolean(target.closest("a"))
    if (e.pointerType === "mouse" && !fromLink) e.preventDefault() // no text selection while dragging
    if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId) // touch captures implicitly
    suppressClick.current = false
    drag.current = { anchor: date, last: date, mode: selected.has(date) ? "remove" : "add", base: new Set(selected), active: false, startX: e.clientX, startY: e.clientY, fromLink }
  }

  function onKey(e: React.KeyboardEvent, date: string) {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    setSelected((s) => { const n = new Set(s); n.has(date) ? n.delete(date) : n.add(date); return n })
  }

  const ruleHint = rule === "monthly_weekday" && sortedSelected[0] ? ` (${weekdayOrdinal(sortedSelected[0])})` : ""
  const chosenEmployee = staff.find((s) => s.id === employeeId)

  return (
    <div className={`cal-wrap${selected.size ? " has-panel" : ""}`}>
      <div className="cal-main">
      <p className="cal-help"><strong>Træk</strong> hen over dagene for at vælge flere – også på mobil. Klik på en dag for at vælge eller fravælge den. Klik på en vagt for at redigere den.</p>
      <div
        className={`cal-grid cal-${view}`}
        role="grid"
        aria-label="Vagtkalender"
        aria-multiselectable="true"
        onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false } }}
        onDragStart={(e) => e.preventDefault()}
      >
        {weekdayNames.map((n) => <div key={n} className="cal-head" role="columnheader">{n}</div>)}
        {days.map((d) => {
          const isSel = selected.has(d.date)
          const list = shifts[d.date] ?? []
          const max = view === "month" ? 3 : 30
          return (
            <div
              key={d.date}
              data-date={d.date}
              role="gridcell"
              tabIndex={0}
              aria-selected={isSel}
              aria-label={`${fmt(d.date)}, ${list.length} vagter${isSel ? ", valgt" : ""}`}
              className={`cal-day${d.inMonth ? "" : " is-out"}${d.isToday ? " is-today" : ""}${isSel ? " is-selected" : ""}${d.date < today ? " is-past" : ""}`}
              onPointerDown={(e) => onPointerDown(e, d.date)}
              onKeyDown={(e) => onKey(e, d.date)}
            >
              <span className="cal-date">{Number(d.date.slice(8))}{view === "week" && <small> {fmt(d.date).split(" ").slice(1).join(" ")}</small>}</span>
              <div className="cal-shifts">
                {list.slice(0, max).map((s) => (
                  <Link key={s.id} href={`${editHref}${s.id}#rediger`} scroll={false} draggable={false} className={`cal-shift status-${s.status}${s.missing ? (s.isOpen ? " is-open" : " is-missing") : ""}`} title={`${s.time} ${s.name}${s.people.length ? ` – ${s.people.map((p) => p.name).join(", ")}` : ""}`}>
                    {s.people.length > 0 && <span className="cal-dots">{s.people.map((p) => <i key={p.id} style={{ background: p.color }} className={p.in ? "is-in" : ""} />)}</span>}
                    <b>{s.time.split("–")[0]}</b> {s.name}
                    {view === "week" && <span className="cal-people">{s.people.map((p) => <em key={p.id} style={{ borderColor: p.color }} className={p.in ? "is-in" : ""}>{p.name}</em>)}{s.missing > 0 && <em className={s.isOpen ? "is-open" : "is-missing"}>{s.isOpen ? `${s.missing} ledig` : `mangler ${s.missing}`}</em>}</span>}
                  </Link>
                ))}
                {list.length > max && <span className="cal-more">+{list.length - max} flere</span>}
              </div>
            </div>
          )
        })}
      </div>
      </div>

      {selected.size > 0 && (
        <a href="#cal-panel" className="cal-jump">{selected.size} dag{selected.size === 1 ? "" : "e"} valgt – fortsæt ↓</a>
      )}
      {selected.size > 0 && (
        <div className="cal-panel admin-form" id="cal-panel" aria-label="Valgte dage">
          <div className="admin-form-title">
            <h2>{selected.size} dag{selected.size === 1 ? "" : "e"} valgt</h2>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Ryd valg" className="cal-clear"><X className="size-4" /> Ryd</button>
          </div>
          <p className="cal-chosen">{sortedSelected.slice(0, 14).map(fmt).join(" · ")}{sortedSelected.length > 14 ? ` · +${sortedSelected.length - 14}` : ""}</p>
          <div className="cal-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "create"} onClick={() => setTab("create")}><CalendarPlus className="size-4" /> Opret nye vagter</button>
            <button type="button" role="tab" aria-selected={tab === "assign"} onClick={() => setTab("assign")}><UserPlus className="size-4" /> Tildel medarbejder ({shiftsOnSelected} vagter)</button>
          </div>

          {tab === "create" ? (
            <form action={createShifts} onSubmit={() => setSubmitting(true)}>
              {sortedSelected.map((d) => <input key={d} type="hidden" name="dates" value={d} />)}
              <input type="hidden" name="back" value={back} />
              <div className="admin-form-grid">
                {staff.length > 0 && (
                  <fieldset className="span-2"><legend>Medarbejder(e) på vagten</legend>
                    <div className="admin-checks">{staff.map((s) => <label key={s.id}><input type="checkbox" name="employees" value={s.id} defaultChecked={s.id === focusEmployee} /> <i className="cal-swatch" style={{ background: s.color }} /> {s.name}</label>)}</div>
                  </fieldset>
                )}
                <label>Sted
                  <select name="location_id" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    <option value="">– Anden adresse –</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                {!locationId ? <label>Adresse *<input name="address" required placeholder="Vejnavn 1, 8600 Silkeborg" /></label> : <label>Titel (valgfri)<input name="title" placeholder="Fx Daglig rengøring" /></label>}
                {!locationId && <label className="span-2">Titel (valgfri)<input name="title" placeholder="Fx Daglig rengøring" /></label>}
                <div className="admin-form-row"><label>Fra *<input name="start" type="time" required defaultValue="07:00" /></label><label>Til<input name="end" type="time" defaultValue="10:00" /></label></div>
                <label>Antal medarbejdere på vagten<input name="max_staff" type="number" min={1} max={20} defaultValue={1} /></label>
                <label>Gentagelse
                  <select name="repeat" value={rule} onChange={(e) => setRule(e.target.value as RepeatRule)}>
                    {repeatOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                {rule !== "none" ? <label>Gentag indtil<input name="until" type="date" required value={until} min={sortedSelected[0]} onChange={(e) => setUntil(e.target.value)} /></label> : <span />}
                <label className="admin-check-row span-2"><input type="checkbox" name="is_open" defaultChecked /> Slå ubesatte pladser op som ledige vagter, medarbejderne selv kan tage</label>
                <label className="span-2">Instruktioner<textarea name="notes" rows={2} placeholder="Hvad skal gøres, særlige ønsker…" /></label>
                <div className="admin-form-actions span-2">
                  <button type="submit" className="admin-primary" disabled={submitting || count === 0 || count >= MAX_OCCURRENCES}>{submitting ? "Opretter…" : `Opret ${count} vagt${count === 1 ? "" : "er"}`}</button>
                  <small className="cal-count">{rule === "none" ? "Kun de valgte dage" : `${repeatOptions.find((o) => o.value === rule)?.label}${ruleHint} indtil ${fmt(until)}`}{count >= MAX_OCCURRENCES ? ` – for mange (maks ${MAX_OCCURRENCES})` : ""}</small>
                </div>
              </div>
            </form>
          ) : (
            <form action={assignEmployeeToDays} onSubmit={() => setSubmitting(true)}>
              {sortedSelected.map((d) => <input key={d} type="hidden" name="dates" value={d} />)}
              <input type="hidden" name="back" value={back} />
              <div className="admin-form-grid">
                <fieldset className="span-2"><legend>Medarbejder</legend>
                  {staff.length ? (
                    <div className="admin-checks">{staff.map((s) => <label key={s.id}><input type="radio" name="employee_id" value={s.id} checked={employeeId === s.id} onChange={() => setEmployeeId(s.id)} required /> <i className="cal-swatch" style={{ background: s.color }} /> {s.name}</label>)}</div>
                  ) : <p className="admin-form-hint">Ingen medarbejdere endnu – invitér dem under Medarbejdere.</p>}
                </fieldset>
                <label>Hvilke vagter
                  <select name="scope" defaultValue="open">
                    <option value="open">Kun vagter der mangler folk</option>
                    <option value="all">Alle vagter på de valgte dage</option>
                  </select>
                </label>
                <label>Sted
                  <select name="location_id" defaultValue="">
                    <option value="">Alle steder</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
                <div className="admin-form-actions span-2">
                  <button type="submit" name="mode" value="add" className="admin-primary" disabled={submitting || !employeeId || shiftsOnSelected === 0}>{submitting ? "Gemmer…" : `Tildel ${chosenEmployee ? chosenEmployee.name.split(" ")[0] : "medarbejder"}`}</button>
                  <button type="submit" name="mode" value="remove" className="admin-view-site" disabled={submitting || !employeeId || shiftsOnSelected === 0}>Fjern fra vagterne</button>
                  {shiftsOnSelected === 0 && <small className="cal-count">Der er ingen vagter på de valgte dage – opret dem først under “Opret nye vagter”.</small>}
                </div>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
