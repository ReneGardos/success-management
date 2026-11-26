import { Check, MapPin, Star } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"

export const dynamic = "force-dynamic"
export const metadata = { title: "Rapporter" }

export default async function CustomerReports({ searchParams }: { searchParams: Promise<{ sted?: string }> }) {
  const p = await customerPortal("/kunde/rapporter")
  const sp = await searchParams
  const db = createAdminClient()
  const filter = sp.sted && p.locIds.includes(sp.sted) ? [sp.sted] : p.locIds
  const { data: reports } = filter.length
    ? await db.from("cleaning_reports").select("id, public_token, created_at, location_id, customer_rating, job:jobs(scheduled_start)").eq("org_id", p.org.id).in("location_id", filter).eq("status", "submitted").eq("customer_visible", true).order("created_at", { ascending: false }).limit(60)
    : { data: [] }
  const rIds = (reports ?? []).map((r) => r.id)
  const [{ data: items }, { data: photos }] = rIds.length
    ? await Promise.all([
        db.from("cleaning_report_items").select("report_id, done").eq("org_id", p.org.id).in("report_id", rIds),
        db.from("photos").select("report_id").eq("org_id", p.org.id).in("report_id", rIds),
      ])
    : [{ data: [] }, { data: [] }]
  const score = new Map<string, [number, number]>()
  for (const i of items ?? []) { const s = score.get(i.report_id) ?? [0, 0]; s[1]++; if (i.done) s[0]++; score.set(i.report_id, s) }
  const pics = new Map<string, number>()
  for (const ph of photos ?? []) if (ph.report_id) pics.set(ph.report_id, (pics.get(ph.report_id) ?? 0) + 1)
  const locName = new Map(p.locations.map((l) => [l.id, l.name]))
  const all = [...score.values()].reduce((a, [d, t]) => [a[0] + d, a[1] + t], [0, 0])
  const rated = (reports ?? []).filter((r) => r.customer_rating)
  const avg = rated.length ? rated.reduce((s, r) => s + Number(r.customer_rating), 0) / rated.length : 0
  const unrated = (reports ?? []).filter((r) => !r.customer_rating).length

  return (
    <main className="pt-page">
      <header className="pt-head"><h1>Rengøringsrapporter</h1><p>Se hvad der er gjort ved hvert besøg.</p></header>
      {p.locations.length > 1 && (
        <nav className="pt-seg" aria-label="Sted">
          <a href="/kunde/rapporter" aria-current={!sp.sted ? "page" : undefined}>Alle</a>
          {p.locations.map((l) => <a key={l.id} href={`/kunde/rapporter?sted=${l.id}`} aria-current={sp.sted === l.id ? "page" : undefined}>{l.name}</a>)}
        </nav>
      )}
      <div className="pt-kpis">
        <div><small>Rapporter</small><strong>{reports?.length ?? 0}</strong><em>seneste 60</em></div>
        <div><small>Opgaver udført</small><strong>{all[1] ? `${Math.round((all[0] / all[1]) * 100)}%` : "–"}</strong><em>{all[0]} af {all[1]}</em></div>
        <div><small>Jeres bedømmelse</small><strong>{avg ? `${avg.toFixed(1).replace(".", ",")} ★` : "–"}</strong><em>{rated.length} bedømt</em></div>
        <div><small>Mangler bedømmelse</small><strong>{unrated}</strong><em>tryk på et besøg</em></div>
      </div>
      <section className="pt-card">
        <ul className="pt-mini">
          {(reports ?? []).map((r) => {
            const [d, t] = score.get(r.id) ?? [0, 0]
            const when = (r.job as unknown as { scheduled_start: string | null } | null)?.scheduled_start ?? r.created_at
            const n = pics.get(r.id) ?? 0
            return (
              <li key={r.id}>
                <a href={`/r/${r.public_token}`}>
                  <strong>{new Date(when).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" })}</strong>
                  <small><MapPin className="size-3 inline" /> {locName.get(String(r.location_id)) ?? ""}{n ? ` · ${n} billede${n === 1 ? "" : "r"}` : ""}</small>
                </a>
                <b>{r.customer_rating ? <span className="rv-stars" aria-label={`${r.customer_rating} stjerner`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`size-3${n <= Number(r.customer_rating) ? " is-on" : ""}`} />)}</span> : <a href={`/r/${r.public_token}#bedom`} className="pt-link">Bedøm</a>}<span className={d === t ? "is-ok" : "is-warn"}><Check className="size-4 inline" /> {d}/{t}</span></b>
              </li>
            )
          })}
          {!reports?.length && <li className="pt-empty">Ingen rapporter endnu. De vises her, når vi har været forbi.</li>}
        </ul>
      </section>
    </main>
  )
}
