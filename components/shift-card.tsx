import { Clock, KeyRound, MapPin, Phone } from "lucide-react"
import { mapsLink } from "@/lib/geo"
import { shiftAddress, shiftName, type Shift } from "@/lib/backend/shifts"
import { formatTime } from "@/lib/time"

const statusLabels: Record<string, string> = { scheduled: "Planlagt", in_progress: "I gang", completed: "Udført", cancelled: "Aflyst" }

/** Shift details for the employee: time, address (maps), access, contact and instructions. */
export default function ShiftCard({ shift, children, highlight }: { shift: Shift; children?: React.ReactNode; highlight?: boolean }) {
  const address = shiftAddress(shift)
  return (
    <article className={`pt-shift${highlight ? " is-now" : ""}${shift.status === "completed" ? " is-done" : ""}`}>
      <header>
        <div><h3>{shiftName(shift)}</h3>{shift.location?.name && shift.title && <p>{shift.location.name}</p>}</div>
        <span className={`pt-pill s-${shift.status}`}>{statusLabels[shift.status] ?? shift.status}</span>
      </header>
      {shift.scheduled_start && <p className="pt-row"><Clock className="size-4" /> {formatTime(shift.scheduled_start)}{shift.scheduled_end ? `–${formatTime(shift.scheduled_end)}` : ""}</p>}
      {address && <a className="pt-row pt-link" href={mapsLink(address)} target="_blank" rel="noreferrer"><MapPin className="size-4" /> {address}</a>}
      {shift.location?.access_notes && <p className="pt-access"><KeyRound className="size-4" /> {shift.location.access_notes}</p>}
      {shift.location?.contact_phone && <a className="pt-row" href={`tel:${shift.location.contact_phone.replace(/\s+/g, "")}`}><Phone className="size-4" /> {shift.location.contact_name ?? "Kontakt"}: {shift.location.contact_phone}</a>}
      {shift.notes && <p className="pt-notes">{shift.notes}</p>}
      {children}
    </article>
  )
}
