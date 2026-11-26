import { Check, Clock, PenLine, Star, X } from "lucide-react"
import type { Photo, Report } from "@/lib/backend/reports"
import { photoKindLabels } from "@/lib/backend/reports"
import { formatTime } from "@/lib/time"

function Thumbs({ photos }: { photos: Photo[] }) {
  if (!photos.length) return null
  return (
    <span className="rv-thumbs">
      {photos.map((p) => <a key={p.id} href={p.url!} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url!} alt={photoKindLabels[p.kind]} loading="lazy" /><em>{photoKindLabels[p.kind]}</em></a>)}
    </span>
  )
}

/** Customer-facing cleaning report: what was done, times on site, photos (also before/after per task) and signature. */
export default function ReportView({ report, title, date, checkIn, checkOut, employee }: { report: Report; title: string; date: string | null; checkIn: string | null; checkOut: string | null; employee: string | null }) {
  const visible = report.photos.filter((p) => p.url && p.kind !== "customer" && p.kind !== "signature")
  const byItem = new Map<string, Photo[]>()
  for (const p of visible) if (p.item_id) byItem.set(p.item_id, [...(byItem.get(p.item_id) ?? []), p])
  const loose = visible.filter((p) => !p.item_id)
  const done = report.items.filter((i) => i.done)
  const notDone = report.items.filter((i) => !i.done)
  const pct = report.items.length ? Math.round((done.length / report.items.length) * 100) : 0
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
        <div className="rv-score" style={{ ["--pct" as string]: `${pct}%` }}><strong>{done.length}/{report.items.length}</strong><span>opgaver udført</span></div>
      </header>
      <ul className="rv-list">
        {done.map((i) => <li key={i.id} className="is-done"><Check className="size-4" /><span>{i.label}{i.note ? <small>{i.note}</small> : null}<Thumbs photos={byItem.get(i.id) ?? []} /></span></li>)}
        {notDone.map((i) => <li key={i.id} className="is-missing"><X className="size-4" /><span>{i.label}<small>{i.note || "Ikke udført denne gang"}</small><Thumbs photos={byItem.get(i.id) ?? []} /></span></li>)}
      </ul>
      {report.note && <p className="rv-note">{report.note}</p>}
      {loose.length > 0 && (
        <div className="rv-photos">
          {loose.map((p) => <figure key={p.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url!} alt={p.caption ?? photoKindLabels[p.kind]} loading="lazy" /><figcaption>{photoKindLabels[p.kind]}{p.caption ? ` · ${p.caption}` : ""}</figcaption></figure>)}
        </div>
      )}
      {report.signatureUrl && (
        <div className="rv-sign">
          <p><PenLine className="size-4" /> Kvitteret på stedet{report.signed_name ? ` af ${report.signed_name}` : ""}{report.signed_at ? ` · ${formatTime(report.signed_at)}` : ""}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={report.signatureUrl} alt="Underskrift" />
        </div>
      )}
      {report.customer_rating && (
        <p className="rv-rated"><span className="rv-stars" aria-label={`${report.customer_rating} af 5 stjerner`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-4${n <= report.customer_rating! ? " is-on" : ""}`} />)}</span>{report.customer_comment ? ` “${report.customer_comment}”` : " Tak for jeres bedømmelse"}</p>
      )}
    </article>
  )
}
