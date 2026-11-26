import Link from "next/link"
import { CalendarDays, Check, ClipboardList, FileText, MessageCircle, Receipt, ShoppingBag, Star, TrendingUp } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { kr } from "@/lib/backend/quotes"
import { memberUnread } from "@/lib/backend/chat"
import { formatDay, formatTime } from "@/lib/time"
import { Countdown, Elapsed } from "@/components/live-clock"
import { Sparkline } from "@/components/charts"

export const dynamic = "force-dynamic"
export const metadata = { title: "Oversigt" }

type Feed = { at: string; icon: "report" | "invoice" | "quote" | "chat" | "visit"; title: string; sub?: string; href?: string; tone?: "ok" | "warn" }
const icons = { report: ClipboardList, invoice: Receipt, quote: FileText, chat: MessageCircle, visit: CalendarDays }
const rel = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
  return d <= 0 ? "I dag" : d === 1 ? "I går" : d < 7 ? `${d} dage siden` : new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" })
}

export default async function CustomerOverview() {
  const p = await customerPortal()
  const { org, ids, locIds } = p
  const db = createAdminClient()
  const locs = locIds.length ? locIds : ["00000000-0000-0000-0000-000000000000"]
  const since = new Date(Date.now() - 90 * 86400000).toISOString()
  const [{ data: upcoming }, { data: reports }, { data: invoices }, { data: quotes }, { data: liveJobs }, unread] = await Promise.all([
    db.from("jobs").select("id, title, scheduled_start, scheduled_end, status, location:locations(name)").eq("org_id", org.id).in("location_id", locs).neq("status", "cancelled").gte("scheduled_start", new Date().toISOString()).order("scheduled_start").limit(5),
    db.from("cleaning_reports").select("id, public_token, created_at, employee_id, customer_rating, location:locations(name)").eq("org_id", org.id).in("location_id", locs).eq("status", "submitted").eq("customer_visible", true).gte("created_at", since).order("created_at", { ascending: false }).limit(40),
    db.from("invoices").select("id, invoice_number, total, status, due_date, issue_date, public_token, sent_at, paid_at").eq("org_id", org.id).neq("status", "draft").in("customer_id", ids).order("issue_date", { ascending: false }).limit(10),
    db.from("quotes").select("id, quote_number, title, status, public_token, sent_at").eq("org_id", org.id).in("status", ["sent", "accepted"]).in("customer_id", ids).order("created_at", { ascending: false }).limit(5),
    db.from("jobs").select("id, title, location:locations(name)").eq("org_id", org.id).in("location_id", locs).eq("status", "in_progress").limit(3),
    memberUnread(org.id, "customer", p.customerIds[0]),
  ])
  const liveIds = (liveJobs ?? []).map((j) => j.id)
  const { data: liveEntries } = liveIds.length ? await db.from("time_entries").select("job_id, employee_id, check_in_at").eq("org_id", org.id).in("job_id", liveIds).is("check_out_at", null) : { data: [] }
  const rIds = (reports ?? []).map((r) => r.id)
  const teamIds = [...new Set([...(reports ?? []).map((r) => r.employee_id), ...(liveEntries ?? []).map((e) => e.employee_id)].filter(Boolean) as string[])]
  const [{ data: items }, { data: team }] = await Promise.all([
    rIds.length ? db.from("cleaning_report_items").select("report_id, done").eq("org_id", org.id).in("report_id", rIds) : Promise.resolve({ data: [] }),
    teamIds.length ? db.from("profiles").select("id, full_name").in("id", teamIds) : Promise.resolve({ data: [] }),
  ])
  const score = new Map<string, [number, number]>()
  for (const i of items ?? []) { const s = score.get(i.report_id) ?? [0, 0]; s[1]++; if (i.done) s[0]++; score.set(i.report_id, s) }
  const firstName = new Map((team ?? []).map((t) => [t.id, (t.full_name ?? "").split(" ")[0] || "Medarbejder"]))
  const visits = new Map<string, number>()
  for (const r of reports ?? []) if (r.employee_id) visits.set(r.employee_id, (visits.get(r.employee_id) ?? 0) + 1)

  const unpaid = (invoices ?? []).filter((i) => i.status === "sent")
  const overdue = unpaid.filter((i) => i.due_date && i.due_date < new Date().toISOString().slice(0, 10))
  const rated = (reports ?? []).filter((r) => r.customer_rating)
  const avg = rated.length ? rated.reduce((s, r) => s + Number(r.customer_rating), 0) / rated.length : 0
  const done = [...score.values()].reduce((a, [d, t]) => [a[0] + d, a[1] + t], [0, 0])
  const trend = [...(reports ?? [])].reverse().map((r) => { const [d, t] = score.get(r.id) ?? [0, 0]; return t ? Math.round((d / t) * 100) : 100 })
  const monthly = p.customers.reduce((s, c) => s + Number(c.monthly_value ?? 0), 0)
  const next = upcoming?.[0]
  const live = (liveEntries ?? [])[0]
  const liveJob = live ? (liveJobs ?? []).find((j) => j.id === live.job_id) : null
  const contact = p.customers[0]

  const feed: Feed[] = [
    ...(reports ?? []).slice(0, 8).map((r) => { const [d, t] = score.get(r.id) ?? [0, 0]; return { at: r.created_at, icon: "report" as const, title: `Rengøring udført · ${(r.location as unknown as { name: string } | null)?.name ?? ""}`, sub: `${d}/${t} opgaver${r.employee_id ? ` · ${firstName.get(r.employee_id) ?? ""}` : ""}${r.customer_rating ? ` · ${"★".repeat(Number(r.customer_rating))}` : " · Bedøm besøget"}`, href: `/r/${r.public_token}${r.customer_rating ? "" : "#bedom"}`, tone: d === t ? ("ok" as const) : ("warn" as const) } }),
    ...(invoices ?? []).filter((i) => i.sent_at).slice(0, 5).map((i) => ({ at: i.paid_at ?? i.sent_at!, icon: "invoice" as const, title: i.status === "paid" ? `Faktura ${i.invoice_number ?? ""} betalt` : `Ny faktura ${i.invoice_number ?? ""}`, sub: kr(Number(i.total)), href: `/f/${i.public_token}`, tone: i.status === "paid" ? ("ok" as const) : undefined })),
    ...(quotes ?? []).filter((q) => q.sent_at).map((q) => ({ at: q.sent_at!, icon: "quote" as const, title: q.status === "accepted" ? `Tilbud #${q.quote_number} accepteret` : `Nyt tilbud #${q.quote_number}`, sub: q.title ?? "", href: `/t/${q.public_token}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10)

  return (
    <main className="pt-page">
      {!p.customerIds.length && <p className="field-err">Din bruger er ikke koblet til en kunde endnu. Kontakt {org.name}.</p>}
      {live ? (
        <section className="hero">
          <span className="hero-chip"><span className="pt-dot" /> Vi er hos jer nu</span>
          <h1>{(liveJob?.location as unknown as { name: string } | null)?.name ?? liveJob?.title ?? "Rengøring i gang"}</h1>
          <span className="hero-sub">{firstName.get(live.employee_id) ?? "Vores medarbejder"} tjekkede ind kl. {formatTime(live.check_in_at)} · i gang i <Elapsed since={live.check_in_at} /></span>
          <div className="hero-row"><Link href="/kunde/beskeder" className="field-btn field-btn-primary"><MessageCircle className="size-5" /> Skriv en besked</Link></div>
        </section>
      ) : (
        <section className="hero">
          <p>Velkommen{contact?.contact_name ? `, ${contact.contact_name.split(" ")[0]}` : ""}</p>
          <h1>{next?.scheduled_start ? <>Næste besøg <Countdown until={next.scheduled_start} /></> : contact ? contact.company || contact.name : "Kundeportal"}</h1>
          {next?.scheduled_start && <span className="hero-sub" style={{ textTransform: "capitalize" }}>{formatDay(next.scheduled_start)} kl. {formatTime(next.scheduled_start)} · {(next.location as unknown as { name: string } | null)?.name ?? next.title}</span>}
          <div className="hero-row">
            <Link href="/kunde/besoeg" className="field-btn field-btn-primary"><CalendarDays className="size-5" /> Alle besøg</Link>
            <Link href="/kunde/bestil" className="field-btn"><ShoppingBag className="size-5" /> Bestil ekstra</Link>
          </div>
        </section>
      )}

      <div className="pt-kpis">
        <div><small><Check className="size-4 inline" /> Opgaver udført</small><strong>{done[1] ? `${Math.round((done[0] / done[1]) * 100)}%` : "–"}</strong>{trend.length > 2 ? <Sparkline values={trend} color={org.color_primary} width={120} height={28} /> : <em>seneste 90 dage</em>}</div>
        <div><small><Star className="size-4 inline" /> Tilfredshed</small><strong>{avg ? `${avg.toFixed(1).replace(".", ",")} ★` : "–"}</strong><em>{rated.length} bedømte besøg</em></div>
        <Link href="/kunde/fakturaer" className={overdue.length ? "is-warn" : ""}><small><Receipt className="size-4 inline" /> Til betaling</small><strong>{kr(unpaid.reduce((s, i) => s + Number(i.total), 0)).replace(",00 kr.", " kr.")}</strong><em>{overdue.length ? `${overdue.length} forfalden` : `${unpaid.length} ubetalt`}</em></Link>
        <div><small><TrendingUp className="size-4 inline" /> Fast aftale</small><strong>{monthly ? kr(monthly).replace(",00 kr.", " kr.") : "–"}</strong><em>pr. måned ekskl. moms</em></div>
      </div>

      {unread > 0 && <Link href="/kunde/beskeder" className="pt-card pt-warn pt-banner"><MessageCircle className="size-5" /> Du har {unread} ny{unread === 1 ? "" : "e"} besked{unread === 1 ? "" : "er"} fra {org.name}</Link>}

      <div className="pt-pairs">
        <section className="pt-card">
          <h2>Seneste aktivitet</h2>
          <ul className="feed">
            {feed.map((f, i) => { const Icon = icons[f.icon]; const body = <><span className={`feed-ic${f.tone ? ` is-${f.tone}` : ""}`}><Icon className="size-4" /></span><span className="feed-tx"><strong>{f.title}</strong>{f.sub && <small>{f.sub}</small>}</span><time>{rel(f.at)}</time></>; return <li key={i}>{f.href ? <a href={f.href}>{body}</a> : <div>{body}</div>}</li> })}
            {!feed.length && <li className="pt-empty">Her kommer rapporter, fakturaer og tilbud til at stå.</li>}
          </ul>
        </section>
        <section className="pt-card">
          <h2>Kommende besøg</h2>
          <ul className="pt-mini">
            {(upcoming ?? []).map((j) => <li key={j.id}><span><strong style={{ textTransform: "capitalize" }}>{formatDay(j.scheduled_start!)}</strong><small>{(j.location as unknown as { name: string } | null)?.name ?? j.title}</small></span><b>{formatTime(j.scheduled_start!)}{j.scheduled_end ? `–${formatTime(j.scheduled_end)}` : ""}</b></li>)}
            {!upcoming?.length && <li className="pt-muted">Ingen planlagte besøg.</li>}
          </ul>
          <Link href="/kunde/besoeg" className="pt-more">Flyt, spring over eller tilføj til kalender</Link>
          {teamIds.length > 0 && (
            <>
              <h2 style={{ marginTop: 18 }}>Jeres team</h2>
              <ul className="team">
                {teamIds.slice(0, 6).map((id) => <li key={id}><span className="sd-av">{(firstName.get(id) ?? "?").slice(0, 1)}</span><span><strong>{firstName.get(id)}</strong><small>{visits.get(id) ? `${visits.get(id)} besøg seneste 90 dage` : "På stedet nu"}</small></span></li>)}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
