import Link from "next/link"
import { redirect } from "next/navigation"
import { MapPin, QrCode } from "lucide-react"
import { getOrgContext } from "@/lib/org"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatTime } from "@/lib/time"
import QrCheckInButton from "@/components/qr-checkin-button"

export const dynamic = "force-dynamic"
export const metadata = { title: "Tjek ind", robots: { index: false, follow: false } }

/** Landing page for the QR sign on a location: pick today's shift there and check in. */
export default async function QrLanding({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[a-f0-9]{24}$/.test(token)) redirect("/")
  const ctx = await getOrgContext()
  if (!ctx) redirect(`/auth/login?next=/q/${token}`)
  const db = createAdminClient()
  const { data: loc } = await db.from("locations").select("id, org_id, name, address").eq("qr_token", token).maybeSingle()
  if (!loc) return <main className="field"><p className="field-err">QR-koden er ikke gyldig længere. Kontakt kontoret.</p></main>
  // The sign belongs to another of the user's companies: switch first.
  if (ctx.org?.id !== loc.org_id) {
    if (ctx.memberships.some((m) => m.orgId === loc.org_id)) redirect(`/org/skift?org=${loc.org_id}&next=/q/${token}`)
    return <main className="field"><p className="field-err">Du har ikke adgang til dette sted.</p></main>
  }
  const org = ctx.org!
  const start = new Date(Date.now() - 6 * 3600000).toISOString()
  const end = new Date(Date.now() + 14 * 3600000).toISOString()
  const { data: jobs } = await db.from("jobs").select("id, title, scheduled_start, scheduled_end, status").eq("org_id", org.id).eq("location_id", loc.id).neq("status", "cancelled").gte("scheduled_start", start).lte("scheduled_start", end).order("scheduled_start")
  const ids = (jobs ?? []).map((j) => j.id)
  const { data: mine } = ids.length ? await db.from("job_assignments").select("job_id").eq("org_id", org.id).eq("employee_id", ctx.user.id).in("job_id", ids) : { data: [] }
  const myJobs = (jobs ?? []).filter((j) => (mine ?? []).some((m) => m.job_id === j.id))
  return (
    <main className="field" style={{ ["--primary" as string]: org.color_primary }}>
      <header className="field-head"><p>{org.name}</p><h1><QrCode className="size-6 inline" /> {loc.name}</h1><span><MapPin className="size-4" /> {loc.address}</span></header>
      {myJobs.length ? myJobs.map((j) => (
        <section key={j.id} className="field-card">
          <h2>{j.title || loc.name} <small>{j.scheduled_start ? `${formatTime(j.scheduled_start)}${j.scheduled_end ? `–${formatTime(j.scheduled_end)}` : ""}` : ""}</small></h2>
          <QrCheckInButton token={token} jobId={j.id} reportHref={`/medarbejder/rapport/${j.id}`} />
        </section>
      )) : (
        <section className="field-card"><h2>Ingen vagt til dig her lige nu</h2><p className="field-hint">Du står ikke på en vagt på dette sted i dag.</p><Link href="/medarbejder/vagter?vis=ledige" className="field-btn">Se ledige vagter</Link></section>
      )}
      <Link href="/medarbejder" className="field-back">Til forsiden</Link>
    </main>
  )
}
