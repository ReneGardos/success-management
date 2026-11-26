import { Check, Clock, X } from "lucide-react"
import type { Report } from "@/lib/backend/reports"
import { photoKindLabels } from "@/lib/backend/reports"
import { formatTime } from "@/lib/time"

/** Customer-facing cleaning report: what was done, times on site and photos. */
export default function ReportView({ report, title, date, checkIn, checkOut, employee }: { report: Report; title: string; date: string | null; checkIn: string | null; checkOut: string | null; employee: string | null }) {
  const done = report.items.filter((i) => i.done)
  const notDone = report.items.filter((i) => !i.done)
  const photos = report.photos.filter((p) => p.kind !== "customer" && p.url)
  return (
    <article className="rv">
      <header className="rv-head">
        <p>Rengøringsrapport</p>
        <h1>{title}</h1>
        <div className="rv-meta">
          {date && <span>{new Date(date).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>}
          {checkIn && <span><Clock className="size-4" /> {formatTime(checkIn)}{checkOut ? `–${formatTime(checkOut)}` : ""}</span>}
          {employee && <span>Udført af {employee.split(" ")[0]}</span>}
        </div>
        <div className="rv-score"><strong>{done.length}/{report.items.length}</strong><span>opgaver udført</span></div>
      </header>
      <ul className="rv-list">
        {done.map((i) => <li key={i.id} className="is-done"><Check className="size-4" /><span>{i.label}{i.note ? <small>{i.note}</small> : null}</span></li>)}
        {notDone.map((i) => <li key={i.id} className="is-missing"><X className="size-4" /><span>{i.label}<small>{i.note || "Ikke udført denne gang"}</small></span></li>)}
      </ul>
      {report.note && <p className="rv-note">{report.note}</p>}
      {photos.length > 0 && (
        <div className="rv-photos">
          {photos.map((p) => <figure key={p.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url!} alt={p.caption ?? photoKindLabels[p.kind]} loading="lazy" /><figcaption>{photoKindLabels[p.kind]}{p.caption ? ` · ${p.caption}` : ""}</figcaption></figure>)}
        </div>
      )}
    </article>
  )
}
