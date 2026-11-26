import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

type View = { path: string; referrer_host: string | null; utm_source: string | null; device: string | null; city: string | null; country: string | null; visitor_hash: string | null; created_at: string }

const ranges = { "7": "7 dage", "30": "30 dage", "90": "90 dage" } as const

function top(rows: View[], pick: (row: View) => string | null, limit = 8) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = pick(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function sourceOf(row: View) {
  if (row.utm_source) return row.utm_source
  const host = row.referrer_host
  if (!host) return "Direkte / ukendt"
  if (/google\./.test(host)) return "Google"
  if (/bing\./.test(host)) return "Bing"
  if (/facebook|fb\./.test(host)) return "Facebook"
  if (/instagram/.test(host)) return "Instagram"
  if (/linkedin|lnkd/.test(host)) return "LinkedIn"
  return host
}

function Bars({ title, items, total }: { title: string; items: [string, number][]; total: number }) {
  return (
    <article className="admin-stat-card">
      <h2>{title}</h2>
      {items.length ? (
        <ol>
          {items.map(([label, value]) => (
            <li key={label}>
              <span className="admin-stat-label" title={label}>{label}</span>
              <span className="admin-stat-bar"><i style={{ width: `${Math.max(4, (value / Math.max(1, total)) * 100)}%` }} /></span>
              <strong>{value}</strong>
            </li>
          ))}
        </ol>
      ) : <p>Ingen data endnu.</p>}
    </article>
  )
}

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<{ dage?: string; side?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/statistik")
  const { dage, side } = await searchParams
  const { data: sites } = await createAdminClient().from("sites").select("id, name").eq("org_id", org.id).order("name")
  const siteId = side && (sites ?? []).some((s) => s.id === side) ? side : null
  const days = dage && dage in ranges ? Number(dage) : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await createAdminClient()
    .from("page_views")
    .select("path, referrer_host, utm_source, device, city, country, visitor_hash, created_at")
    .eq("org_id", org.id)
    .match(siteId ? { site_id: siteId } : {})
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50000)
  const rows = (data ?? []) as View[]

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" })
  const visitors = new Set(rows.map((r) => `${dayKey(r.created_at)}|${r.visitor_hash}`)).size
  const todayRows = rows.filter((r) => dayKey(r.created_at) === today)
  const todayVisitors = new Set(todayRows.map((r) => r.visitor_hash)).size

  const perDay = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) perDay.set(new Date(Date.now() - i * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }), 0)
  for (const r of rows) {
    const key = dayKey(r.created_at)
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }
  const maxDay = Math.max(1, ...perDay.values())

  return (
    <main className="admin-shell">
      <div className="admin-workspace">
        <Link href="/admin" className="admin-back"><ArrowLeft className="size-4" /> Tilbage til overblik</Link>
        <p className="admin-eyebrow">{org.name} / Statistik</p>
        {(sites?.length ?? 0) > 1 && <nav className="admin-tabs" aria-label="Hjemmeside"><Link href={`?dage=${days}`} aria-current={!siteId ? "page" : undefined}>Alle hjemmesider</Link>{sites!.map((s) => <Link key={s.id} href={`?dage=${days}&side=${s.id}`} aria-current={siteId === s.id ? "page" : undefined}>{s.name}</Link>)}</nav>}
        <div className="admin-workspace-heading">
          <div><h1>Besøgende</h1><p>Uden cookies. Én besøgende tælles én gang pr. dag.</p></div>
          <nav className="admin-tabs" aria-label="Periode">
            {Object.entries(ranges).map(([value, label]) => (
              <Link key={value} href={`?dage=${value}`} aria-current={Number(value) === days ? "page" : undefined}>{label}</Link>
            ))}
          </nav>
        </div>

        {error ? (
          <div className="admin-empty-state" role="alert"><strong>!</strong><span>Statistik er ikke sat op</span><p>Databasetabellen page_views mangler. Kør database-opdateringen (supabase/migrations) – se Systemstatus.</p></div>
        ) : (
          <>
            <section className="admin-metrics" aria-label="Nøgletal">
              <article className="admin-metric"><strong>{todayVisitors}</strong><span>Besøgende i dag</span></article>
              <article className="admin-metric"><strong>{visitors}</strong><span>Besøgende ({ranges[String(days) as keyof typeof ranges]})</span></article>
              <article className="admin-metric"><strong>{rows.length}</strong><span>Sidevisninger</span></article>
            </section>

            <article className="admin-stat-card admin-stat-wide">
              <h2>Sidevisninger pr. dag</h2>
              <div className="admin-day-chart" role="img" aria-label={`Sidevisninger pr. dag de sidste ${days} dage`}>
                {[...perDay.entries()].map(([day, value]) => (
                  <span key={day} title={`${day}: ${value}`} style={{ height: `${Math.max(2, (value / maxDay) * 100)}%` }} />
                ))}
              </div>
            </article>

            <div className="admin-stat-grid">
              <Bars title="Mest besøgte sider" items={top(rows, (r) => r.path)} total={rows.length} />
              <Bars title="Hvor kommer de fra" items={top(rows, sourceOf)} total={rows.length} />
              <Bars title="Byer" items={top(rows, (r) => r.city)} total={rows.length} />
              <Bars title="Enheder" items={top(rows, (r) => r.device)} total={rows.length} />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
