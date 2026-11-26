"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CalendarOff, Copy, ExternalLink, GripVertical, Loader2, Move, X } from "lucide-react"
import { moveShift } from "@/app/admin/vagtplan/actions"

export type BoardShift = { id: string; date: string; time: string; hours: number; name: string; status: string; missing: number; isOpen: boolean; employeeIds: string[]; checkedIn: string[] }
export type BoardPerson = { id: string; name: string; color: string; absent: string[] }
type Days = { date: string; label: string; isToday: boolean }[]
type Grab = { id: string; from: string }

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")

/**
 * Week board: one row per employee (plus a row for shifts that still need people).
 * Drag a shift to another day and/or person (⌥/Alt = copy). On touch: tap to pick, tap a cell to drop.
 */
export default function ShiftBoard({ days, people, shifts, editHref, weeklyTarget = 37 }: { days: Days; people: BoardPerson[]; shifts: BoardShift[]; editHref: string; weeklyTarget?: number }) {
  const router = useRouter()
  const [local, setLocal] = useState(shifts)
  const [grab, setGrab] = useState<Grab | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const [copyMode, setCopyMode] = useState(false)

  // Server data wins after refresh.
  const key = shifts.map((s) => `${s.id}:${s.date}:${s.employeeIds.join(",")}`).join("|")
  const [seen, setSeen] = useState(key)
  if (seen !== key) { setSeen(key); setLocal(shifts) }

  const cell = useMemo(() => {
    const m = new Map<string, BoardShift[]>()
    for (const s of local) {
      if (s.status === "cancelled") continue
      for (const e of s.employeeIds) m.set(`${e}|${s.date}`, [...(m.get(`${e}|${s.date}`) ?? []), s])
      if (s.missing > 0 || !s.employeeIds.length) m.set(`|${s.date}`, [...(m.get(`|${s.date}`) ?? []), s])
    }
    for (const v of m.values()) v.sort((a, b) => a.time.localeCompare(b.time))
    return m
  }, [local])

  const hoursFor = (pid: string) => local.filter((s) => s.status !== "cancelled" && s.employeeIds.includes(pid)).reduce((t, s) => t + s.hours, 0)
  const dayStats = (d: string) => { const l = local.filter((s) => s.date === d && s.status !== "cancelled"); return { n: l.length, gaps: l.reduce((t, s) => t + s.missing, 0) } }

  function drop(toPerson: string, toDate: string, copy: boolean) {
    const g = grab
    setGrab(null)
    setOver(null)
    if (!g) return
    const s = local.find((x) => x.id === g.id)
    if (!s || (s.date === toDate && g.from === toPerson && !copy)) return
    if (toPerson && people.find((p) => p.id === toPerson)?.absent.includes(toDate) && !confirm("Medarbejderen har fravær den dag. Flyt alligevel?")) return
    if (!copy) {
      setLocal((list) => list.map((x) => {
        if (x.id !== s.id) return x
        let ids = x.employeeIds.filter((e) => e !== g.from)
        if (toPerson && !ids.includes(toPerson)) ids = [...ids, toPerson]
        const filled = ids.length
        return { ...x, date: toDate, employeeIds: g.from === toPerson ? x.employeeIds : ids, missing: Math.max(0, x.missing + (g.from === toPerson ? 0 : (g.from ? 1 : 0) - (toPerson ? 1 : 0))), isOpen: x.isOpen || !toPerson || filled === 0 }
      }))
    }
    start(async () => {
      const r = await moveShift({ jobId: s.id, toDate, from: g.from, to: toPerson, copy })
      setToast({ ok: r.ok, text: r.message })
      setTimeout(() => setToast(null), 3500)
      router.refresh()
    })
  }

  const rows: { id: string; name: string; color: string; absent: string[]; open?: boolean }[] = [{ id: "", name: "Mangler folk / ledige", color: "#C6A467", absent: [], open: true }, ...people]

  return (
    <div className={`sb${grab ? " is-grabbing" : ""}`}>
      <div className="sb-bar">
        <span className="sb-hint">{grab ? <><Move className="size-4" /> Tryk på en celle for at {copyMode ? "kopiere" : "flytte"} vagten · <button type="button" onClick={() => setGrab(null)}><X className="size-3" /> Annullér</button></> : <><GripVertical className="size-4" /> Træk en vagt til en anden dag eller person. Hold ⌥/Alt for at kopiere.</>}</span>
        <label className="sb-copy"><input type="checkbox" checked={copyMode} onChange={(e) => setCopyMode(e.target.checked)} /> <Copy className="size-4" /> Kopiér i stedet for at flytte</label>
        {pending && <Loader2 className="size-4 animate-spin" />}
      </div>
      <div className="sb-scroll">
        <div className="sb-grid" style={{ ["--days" as string]: days.length }}>
          <div className="sb-corner">Medarbejder</div>
          {days.map((d) => { const st = dayStats(d.date); return (
            <div key={d.date} className={`sb-day${d.isToday ? " is-today" : ""}`}><strong>{d.label}</strong><small>{st.n} vagter{st.gaps ? <em> · {st.gaps} mangler</em> : null}</small></div>
          ) })}
          {rows.map((p) => {
            const h = p.open ? 0 : hoursFor(p.id)
            return (
              <div key={p.id || "open"} className={`sb-row${p.open ? " is-open" : ""}`} role="row">
                <div className="sb-person">
                  {p.open ? <span className="sb-av is-open"><AlertTriangle className="size-4" /></span> : <span className="sb-av" style={{ background: p.color }}>{initials(p.name)}</span>}
                  <span className="sb-pname"><strong>{p.name}</strong>{!p.open && <small><span className="sb-meter"><i style={{ width: `${Math.min(100, (h / weeklyTarget) * 100)}%`, background: h > weeklyTarget ? "#D92D20" : p.color }} /></span>{Math.round(h * 10) / 10} t</small>}</span>
                </div>
                {days.map((d) => {
                  const k = `${p.id}|${d.date}`
                  const list = cell.get(k) ?? []
                  const absent = p.absent.includes(d.date)
                  return (
                    <div
                      key={k}
                      className={`sb-cell${over === k ? " is-over" : ""}${absent ? " is-absent" : ""}${d.isToday ? " is-today" : ""}`}
                      onDragOver={(e) => { if (grab) { e.preventDefault(); e.dataTransfer.dropEffect = e.altKey || copyMode ? "copy" : "move"; setOver(k) } }}
                      onDragLeave={() => setOver((o) => (o === k ? null : o))}
                      onDrop={(e) => { e.preventDefault(); drop(p.id, d.date, e.altKey || copyMode) }}
                      onClick={(e) => { if (grab && e.target === e.currentTarget) drop(p.id, d.date, copyMode) }}
                    >
                      {absent && <span className="sb-absent"><CalendarOff className="size-3" /> Fravær</span>}
                      {list.map((s) => {
                        const isGrab = grab?.id === s.id && grab.from === p.id
                        const inNow = !p.open && s.checkedIn.includes(p.id)
                        return (
                          <div
                            key={s.id}
                            className={`sb-chip s-${s.status}${p.open ? " is-gap" : ""}${isGrab ? " is-grab" : ""}${inNow ? " is-in" : ""}`}
                            style={p.open ? undefined : { ["--c" as string]: p.color }}
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", s.id); e.dataTransfer.effectAllowed = "copyMove"; setGrab({ id: s.id, from: p.id }) }}
                            onDragEnd={() => { setGrab(null); setOver(null) }}
                            onClick={(e) => { e.stopPropagation(); if (grab && !isGrab) return drop(p.id, d.date, copyMode); setGrab(isGrab ? null : { id: s.id, from: p.id }) }}
                            title={`${s.time} ${s.name}`}
                          >
                            <b>{s.time}</b>
                            <span>{s.name}</span>
                            {p.open && <em>{s.missing > 0 ? `mangler ${s.missing}` : "ingen tildelt"}</em>}
                            {!p.open && s.employeeIds.length > 1 && <em>+{s.employeeIds.length - 1}</em>}
                            <a href={`${editHref}${s.id}`} className="sb-open" onClick={(e) => e.stopPropagation()} aria-label="Åbn vagt" draggable={false}><ExternalLink className="size-3" /></a>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      {toast && <div className={`sb-toast${toast.ok ? "" : " is-err"}`} role="status">{toast.text}</div>}
    </div>
  )
}
