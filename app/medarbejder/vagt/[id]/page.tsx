import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, ClipboardList, Clock, KeyRound, ListChecks, MapPin, MessageCircle, Navigation, Phone, Users } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { loadShifts, shiftAddress, shiftName } from "@/lib/backend/shifts"
import { mapsLink } from "@/lib/geo"
import { formatDay, formatTime, todayLocal } from "@/lib/time"
import { CheckOutForm } from "@/components/employee-shift-actions"
import SlideCheckIn from "@/components/slide-check-in"
import { Countdown, Elapsed } from "@/components/live-clock"
import { OfferShift, TakeOver } from "@/components/handover-actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Vagt" }

const statusLabels: Record<string, string> = { scheduled: "Planlagt", in_progress: "I gang", completed: "Udført", cancelled: "Aflyst" }

export default async function ShiftDetail({ params }: { params: Promise<{ id: string }> }) {
  const p = await employeePortal()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = createAdminClient()
  const { data: row } = await db.from("jobs").select("scheduled_start").eq("org_id", p.org.id).eq("id", id).maybeSingle()
  if (!row?.scheduled_start) notFound()
  const t = new Date(row.scheduled_start).getTime()
  const { shifts } = await loadShifts(p.org.id, new Date(t - 1000).toISOString(), new Date(t + 1000).toISOString(), { onlyIds: [id] })
  const s = shifts[0]
  if (!s) notFound()
  const mine = s.employeeIds.includes(p.userId)
  const [{ data: handovers }, { data: colleagues }, { data: tasks }, { data: entry }, { data: report }] = await Promise.all([
    db.from("shift_handovers").select("id, employee_id, status").eq("org_id", p.org.id).eq("job_id", id).eq("status", "open"),
    s.employeeIds.length ? db.from("profiles").select("id, full_name, phone").in("id", s.employeeIds) : Promise.resolve({ data: [] }),
    s.location_id ? db.from("location_tasks").select("label, area").eq("org_id", p.org.id).eq("location_id", s.location_id).eq("active", true).order("position").limit(40) : Promise.resolve({ data: [] }),
    db.from("time_entries").select("id, check_in_at, check_out_at").eq("org_id", p.org.id).eq("employee_id", p.userId).eq("job_id", id).order("check_in_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("cleaning_reports").select("status").eq("org_id", p.org.id).eq("job_id", id).eq("employee_id", p.userId).maybeSingle(),
  ])
  const myOffer = (handovers ?? []).find((h) => h.employee_id === p.userId)
  const otherOffer = (handovers ?? []).find((h) => h.employee_id !== p.userId)
  const { data: anyOpen } = await db.from("time_entries").select("id").eq("org_id", p.org.id).eq("employee_id", p.userId).is("check_out_at", null).maybeSingle()
  const isToday = new Date(s.scheduled_start!).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }) === todayLocal()
  const checkedIn = entry && !entry.check_out_at
  const addr = shiftAddress(s)
  const grouped = new Map<string, string[]>()
  for (const tk of tasks ?? []) grouped.set(tk.area || "Opgaver", [...(grouped.get(tk.area || "Opgaver") ?? []), tk.label])

  return (
    <main className="pt-page">
      <Link href="/medarbejder/vagter" className="pt-link"><ArrowLeft className="size-4 inline" /> Vagter</Link>
      <section className={`sd-hero s-${s.status}${checkedIn ? " is-live" : ""}`}>
        <p><CalendarDays className="size-4 inline" /> <span style={{ textTransform: "capitalize" }}>{formatDay(s.scheduled_start!)}</span></p>
        <h1>{shiftName(s)}</h1>
        <div className="sd-time">
          <span><Clock className="size-5 inline" /> {formatTime(s.scheduled_start!)}{s.scheduled_end ? `–${formatTime(s.scheduled_end)}` : ""}</span>
          <span className={`pt-pill s-${s.status}`}>{statusLabels[s.status] ?? s.status}</span>
        </div>
        {checkedIn ? <p className="sd-big"><span className="pt-dot" /> Tjekket ind · <Elapsed since={entry!.check_in_at} /></p>
          : s.status === "scheduled" && new Date(s.scheduled_start!).getTime() > Date.now() ? <p className="sd-big">Starter <Countdown until={s.scheduled_start!} /></p> : null}
      </section>

      {mine && !p.preview && (
        <section className="pt-card sd-actions">
          {checkedIn ? <CheckOutForm entryId={String(entry!.id)} /> : isToday && !anyOpen && s.status !== "completed" ? <SlideCheckIn jobId={s.id} /> : null}
          <Link href={`/medarbejder/rapport/${s.id}`} className="field-btn field-btn-primary"><ClipboardList className="size-5" /> {report?.status === "submitted" ? "Se rapport" : "Rengøringsrapport"}</Link>
          {s.status === "scheduled" && new Date(s.scheduled_start!).getTime() > Date.now() && <OfferShift jobId={s.id} openId={myOffer?.id} />}
        </section>
      )}
      {!mine && otherOffer && !p.preview && <section className="pt-card pt-warn"><h2>Kan du tage vagten?</h2><p className="pt-muted">En kollega har sat vagten til overtagelse.</p><TakeOver handoverId={otherOffer.id} /></section>}

      <div className="pt-pairs">
        <section className="pt-card sd-info">
          <h2>Sted</h2>
          {addr && <a href={mapsLink(addr)} target="_blank" rel="noreferrer" className="pt-row pt-link"><MapPin className="size-4" /> {addr}</a>}
          {addr && <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className="field-btn"><Navigation className="size-5" /> Vis vej</a>}
          {s.location?.access_notes && <p className="pt-access"><KeyRound className="size-4" /> {s.location.access_notes}</p>}
          {s.location?.contact_phone && <a className="pt-row" href={`tel:${s.location.contact_phone.replace(/\s+/g, "")}`}><Phone className="size-4" /> {s.location.contact_name ?? "Kontakt"}: {s.location.contact_phone}</a>}
          {s.notes && <p className="pt-notes">{s.notes}</p>}
        </section>
        <section className="pt-card">
          <h2><Users className="size-4 inline" /> På vagten</h2>
          <ul className="sd-team">
            {(colleagues ?? []).map((c) => <li key={c.id}><span className="sd-av">{(c.full_name ?? "?").split(" ").map((x: string) => x[0]).slice(0, 2).join("")}</span><span><strong>{c.full_name ?? "Ukendt"}{c.id === p.userId ? " (dig)" : ""}</strong>{c.phone && c.id !== p.userId && <a href={`tel:${c.phone.replace(/\s+/g, "")}`}>{c.phone}</a>}</span></li>)}
            {s.employeeIds.length < s.max_staff && <li className="pt-muted">{s.max_staff - s.employeeIds.length} plads{s.max_staff - s.employeeIds.length === 1 ? "" : "er"} ledig</li>}
          </ul>
          <Link href="/medarbejder/beskeder" className="field-btn"><MessageCircle className="size-5" /> Skriv til kontoret</Link>
        </section>
      </div>
      {grouped.size > 0 && (
        <section className="pt-card">
          <h2><ListChecks className="size-4 inline" /> Opgaver på stedet</h2>
          <div className="sd-tasks">
            {[...grouped].map(([area, list]) => <div key={area}><h3>{area}</h3><ul>{list.map((l, i) => <li key={i}>{l}</li>)}</ul></div>)}
          </div>
        </section>
      )}
    </main>
  )
}
