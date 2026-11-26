import Link from "next/link"
import { CalendarDays, Check, ClipboardList, Receipt, TrendingUp } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { kr } from "@/lib/backend/quotes"
import { formatDay, formatTime } from "@/lib/time"

export const dynamic = "force-dynamic"
export const metadata = { title: "Oversigt" }

export default async function CustomerOverview() {
  const p = await customerPortal()
  const { org, ids, locIds } = p
  const db = createAdminClient()
  const locs = locIds.length ? locIds : ["00000000-0000-0000-0000-000000000000"]
  const [{ data: upcoming }, { data: reports }, { data: invoices }, { data: feedback }] = await Promise.all([
    db.from("jobs").select("id, title, scheduled_start, scheduled_end, status, location:locations(name)").eq("org_id", org.id).in("location_id", locs).neq("status", "cancelled").gte("scheduled_start", new Date().toISOString()).order("scheduled_start").limit(6),
    db.from("cleaning_reports").select("id, public_token, created_at, location:locations(name)").eq("org_id", org.id).in("location_id", locs).eq("status", "submitted").eq("customer_visible", true).order("created_at", { ascending: false }).limit(4),
    db.from("invoices").select("total, due_date").eq("org_id", org.id).eq("status", "sent").in("customer_id", ids),
    db.from("customer_feedback").select("id, status").eq("org_id", org.id).in("customer_id", ids).eq("status", "open"),
  ])
  const rIds = (reports ?? []).map((r) => r.id)
  const { data: items } = rIds.length ? await db.from("cleaning_report_items").select("report_id, done").eq("org_id", org.id).in("report_id", rIds) : { data: [] }
  const score = new Map<string, [number, number]>()
  for (const i of items ?? []) { const s = score.get(i.report_id) ?? [0, 0]; s[1]++; if (i.done) s[0]++; score.set(i.report_id, s) }
  const last = reports?.[0]
  const lastScore = last ? score.get(last.id) : undefined
  const outstanding = (invoices ?? []).reduce((s, i) => s + Number(i.total), 0)
  const monthly = p.customers.reduce((s, c) => s + Number(c.monthly_value ?? 0), 0)
  const next = upcoming?.[0]
  const contact = p.customers[0]

  return (
    <main className="pt-page">
      <section className="pt-hello"><p>Velkommen{contact?.contact_name ? `, ${contact.contact_name.split(" ")[0]}` : ""}</p><h1>{contact ? contact.company || contact.name : "Kundeportal"}</h1><span>Her kan I følge rengøringen, se rapporter og fakturaer og give os besked.</span></section>
      {!p.customerIds.length && <p className="field-err">Din bruger er ikke koblet til en kunde endnu. Kontakt {org.name}.</p>}
      <div className="pt-kpis">
        <div><small><CalendarDays className="size-4 inline" /> Næste besøg</small><strong>{next?.scheduled_start ? formatDay(next.scheduled_start) : "–"}</strong><em>{next?.scheduled_start ? formatTime(next.scheduled_start) : ""}</em></div>
        <div><small><ClipboardList className="size-4 inline" /> Seneste rapport</small><strong>{lastScore ? `${lastScore[0]}/${lastScore[1]}` : "–"}</strong><em>{last ? new Date(last.created_at).toLocaleDateString("da-DK") : "opgaver udført"}</em></div>
        <div><small><Receipt className="size-4 inline" /> Ubetalt</small><strong>{kr(outstanding).replace(",00 kr.", " kr.")}</strong><em>{invoices?.length ?? 0} faktura{(invoices?.length ?? 0) === 1 ? "" : "er"}</em></div>
        <div><small><TrendingUp className="size-4 inline" /> Fast aftale</small><strong>{monthly ? kr(monthly).replace(",00 kr.", " kr.") : "–"}</strong><em>pr. måned ekskl. moms</em></div>
      </div>
      <div className="pt-pairs">
        <section className="pt-card">
          <h2>Kommende besøg</h2>
          <ul className="pt-mini">
            {(upcoming ?? []).map((j) => <li key={j.id}><span><strong>{formatDay(j.scheduled_start!)}</strong><small>{(j.location as unknown as { name: string } | null)?.name ?? j.title}</small></span><b>{formatTime(j.scheduled_start!)}{j.scheduled_end ? `–${formatTime(j.scheduled_end)}` : ""}</b></li>)}
            {!upcoming?.length && <li className="pt-muted">Ingen planlagte besøg.</li>}
          </ul>
          <Link href="/kunde/besoeg" className="pt-more">Flyt, spring over eller tilføj til kalender</Link>
        </section>
        <section className="pt-card">
          <h2>Seneste rapporter</h2>
          <ul className="pt-mini">
            {(reports ?? []).map((r) => { const [d, t] = score.get(r.id) ?? [0, 0]; return <li key={r.id}><a href={`/r/${r.public_token}`}><strong>{new Date(r.created_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })}</strong><small>{(r.location as unknown as { name: string } | null)?.name}</small></a><b className={d === t ? "is-ok" : "is-warn"}><Check className="size-4 inline" /> {d}/{t}</b></li> })}
            {!reports?.length && <li className="pt-muted">Ingen rapporter endnu.</li>}
          </ul>
          <Link href="/kunde/rapporter" className="pt-more">Alle rapporter</Link>
        </section>
      </div>
      <div className="pt-cta">
        <Link href="/kunde/bestil" className="field-btn field-btn-primary">Bestil ekstra opgave</Link>
        <Link href="/kunde/feedback" className="field-btn">Giv os besked{feedback?.length ? ` (${feedback.length} åbne)` : ""}</Link>
      </div>
    </main>
  )
}
