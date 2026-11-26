import Link from "next/link"
import { Clock, MapPin, Navigation } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"
import { loadShifts, shiftAddress, shiftName } from "@/lib/backend/shifts"
import { distanceMeters, mapsLink } from "@/lib/geo"
import { addDays, copenhagenToIso, formatDay, formatTime, todayLocal } from "@/lib/time"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dagens rute" }

/** Projects coordinates into a small SVG "map" (no external map service needed). */
function RouteMap({ points }: { points: { lat: number; lng: number; n: number; done: boolean }[] }) {
  if (points.length < 1) return null
  const W = 640, H = 300, pad = 36
  const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng)
  const midLat = (Math.max(...lats) + Math.min(...lats)) / 2
  const k = Math.cos((midLat * Math.PI) / 180)
  const xs = lngs.map((l) => l * k)
  const spanX = Math.max(...xs) - Math.min(...xs) || 0.01, spanY = Math.max(...lats) - Math.min(...lats) || 0.01
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY)
  const ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2
  const P = points.map((p) => ({ ...p, x: ox + (p.lng * k - Math.min(...xs)) * scale, y: H - (oy + (p.lat - Math.min(...lats)) * scale) }))
  const path = P.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rt-map" role="img" aria-label="Kort over dagens stop">
      <defs><pattern id="rtgrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="currentColor" strokeOpacity=".07" /></pattern></defs>
      <rect width={W} height={H} fill="url(#rtgrid)" />
      {P.length > 1 && <path d={path} fill="none" stroke="var(--primary)" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />}
      {P.map((p) => (
        <g key={p.n} transform={`translate(${p.x} ${p.y})`}>
          <circle r="16" fill={p.done ? "#98A2B3" : "var(--primary)"} stroke="#fff" strokeWidth="3" />
          <text textAnchor="middle" dy="5" fill="#fff" fontSize="14" fontWeight="800">{p.n}</text>
        </g>
      ))}
    </svg>
  )
}

export default async function RoutePage({ searchParams }: { searchParams: Promise<{ dato?: string }> }) {
  const p = await employeePortal("/medarbejder/rute")
  const sp = await searchParams
  const day = sp.dato && /^\d{4}-\d{2}-\d{2}$/.test(sp.dato) ? sp.dato : todayLocal()
  const { data: assignments } = await createAdminClient().from("job_assignments").select("job_id").eq("org_id", p.org.id).eq("employee_id", p.userId)
  const { shifts } = await loadShifts(p.org.id, copenhagenToIso(day, "00:00")!, copenhagenToIso(addDays(day, 1), "00:00")!, { onlyIds: (assignments ?? []).map((a) => String(a.job_id)) })
  const stops = shifts.filter((s) => s.status !== "cancelled")
  const located = stops.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => s.location?.lat != null && s.location?.lng != null)
  let km = 0
  for (let i = 1; i < located.length; i++) km += distanceMeters(located[i - 1].s.location!.lat!, located[i - 1].s.location!.lng!, located[i].s.location!.lat!, located[i].s.location!.lng!) / 1000
  const addresses = stops.map((s) => shiftAddress(s)).filter(Boolean) as string[]
  const directions = addresses.length
    ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(addresses[addresses.length - 1])}${addresses.length > 1 ? `&waypoints=${encodeURIComponent(addresses.slice(0, -1).join("|"))}` : ""}`
    : null
  const hours = stops.reduce((t, s) => t + (s.scheduled_start && s.scheduled_end ? (new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start).getTime()) / 3600000 : 0), 0)

  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Rute · <span style={{ textTransform: "capitalize" }}>{formatDay(copenhagenToIso(day, "12:00")!)}</span></h1><p>{stops.length} stop · ca. {Math.round(hours * 10) / 10} timer{km ? ` · ${Math.round(km)} km i luftlinje` : ""}</p></header>
      <nav className="pt-seg" aria-label="Dag">
        <Link href={`?dato=${addDays(day, -1)}`}>‹ I går</Link>
        <Link href="?" aria-current={day === todayLocal() ? "page" : undefined}>I dag</Link>
        <Link href={`?dato=${addDays(day, 1)}`}>I morgen ›</Link>
      </nav>
      {located.length > 0 && <section className="pt-card rt-card"><RouteMap points={located.map(({ s, n }) => ({ lat: s.location!.lat!, lng: s.location!.lng!, n, done: s.status === "completed" }))} /></section>}
      {directions && <a href={directions} target="_blank" rel="noreferrer" className="field-btn field-btn-primary"><Navigation className="size-5" /> Start rute i Google Maps</a>}
      <ol className="rt-stops">
        {stops.map((s, i) => {
          const addr = shiftAddress(s)
          const prev = stops[i - 1]
          const gap = prev?.location?.lat != null && s.location?.lat != null ? distanceMeters(prev.location!.lat!, prev.location!.lng!, s.location!.lat!, s.location!.lng!) : null
          return (
            <li key={s.id} className={s.status === "completed" ? "is-done" : ""}>
              {gap != null && <p className="rt-gap">{gap < 1000 ? `${gap} m` : `${(gap / 1000).toFixed(1).replace(".", ",")} km`}</p>}
              <div className="rt-stop">
                <span className="rt-n">{i + 1}</span>
                <div>
                  <strong>{shiftName(s)}</strong>
                  {s.scheduled_start && <small><Clock className="size-3 inline" /> {formatTime(s.scheduled_start)}{s.scheduled_end ? `–${formatTime(s.scheduled_end)}` : ""}</small>}
                  {addr && <a href={mapsLink(addr)} target="_blank" rel="noreferrer"><MapPin className="size-3 inline" /> {addr}</a>}
                  {s.location?.access_notes && <em>🔑 {s.location.access_notes}</em>}
                </div>
                <Link href={`/medarbejder/rapport/${s.id}`} className="rt-go" aria-label="Rapport">›</Link>
              </div>
            </li>
          )
        })}
        {!stops.length && <li className="pt-empty">Ingen vagter denne dag.</li>}
      </ol>
    </main>
  )
}
