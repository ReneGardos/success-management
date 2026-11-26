import Link from "next/link"
import { ArrowUpRight, BarChart3, PackageOpen, Receipt, CalendarDays, CheckCircle2, CircleAlert, Clock, Eye, FileSignature, Inbox, LogIn, Mail, MessageSquare, Plus, TrendingUp, Users } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadShifts, shiftName } from "@/lib/backend/shifts"
import { listStaff } from "@/lib/backend/staff"
import { inboundConfigured, mailConfigured, officeEmailFor } from "@/lib/backend/mail"
import { kr } from "@/lib/backend/quotes"
import { addDays, copenhagenToIso, dayKey, formatTime, mondayOf, todayLocal, weekNumber } from "@/lib/time"
import { AreaChart, BarChart, Delta, Donut, HBars, Sparkline } from "@/components/charts"

export const dynamic = "force-dynamic"
export const metadata = { title: "Overblik" }

const DAY = 86400000
const leadStages = [
  ["new", "Ny"],
  ["contacted", "Kontaktet"],
  ["qualified", "Kvalificeret"],
  ["quoted", "Tilbud sendt"],
  ["won", "Vundet"],
  ["lost", "Tabt"],
] as const

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("da-DK", { hour: "numeric", hour12: false, timeZone: "Europe/Copenhagen" }).format(new Date()))
  return hour < 10 ? "Godmorgen" : hour < 18 ? "Goddag" : "Godaften"
}

const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short", timeZone: "UTC" })
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "lige nu"
  if (m < 60) return `${m} min siden`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} t siden`
  const d = Math.round(h / 24)
  return d === 1 ? "i går" : `${d} dage siden`
}

type Activity = { at: string; icon: "lead" | "quote" | "accept" | "mail" | "in"; text: string; href?: string }

export default async function AdminDashboard() {
  const { org, fullName } = await requireRolePage(["admin"], "/admin")
  const db = createAdminClient()
  const orgId = org.id
  const today = todayLocal()
  const now = Date.now()
  const since60 = new Date(now - 60 * DAY).toISOString()
  const weekStart = mondayOf(today)
  const eightWeeksAgo = addDays(weekStart, -7 * 7)

  const [requests, views, quotes, leads, entries, mails, { shifts: todayShifts }, { staff }, openEntriesRes, openShiftsRes, invoicesRes, supplyRes, feedbackRes] = await Promise.all([
    db.from("contact_requests").select("id, name, company, created_at, status").eq("org_id", orgId).gte("created_at", since60).order("created_at", { ascending: false }).limit(2000),
    db.from("page_views").select("path, referrer_host, visitor_hash, created_at").eq("org_id", orgId).gte("created_at", since60).limit(50000),
    db.from("quotes").select("id, quote_number, status, total, billing, recipient_company, recipient_name, created_at, sent_at, viewed_at, accepted_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1000),
    db.from("leads").select("id, status, value").eq("org_id", orgId).limit(5000),
    db.from("time_entries").select("employee_id, check_in_at, check_out_at").eq("org_id", orgId).gte("check_in_at", copenhagenToIso(eightWeeksAgo, "00:00")!).limit(10000),
    db.from("email_messages").select("id, contact_request_id, from_email, subject, created_at, read_at").eq("org_id", orgId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(50),
    loadShifts(orgId, copenhagenToIso(today, "00:00")!, copenhagenToIso(addDays(today, 1), "00:00")!),
    listStaff(orgId),
    db.from("time_entries").select("job_id, employee_id, check_in_at").eq("org_id", orgId).is("check_out_at", null),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("is_open", true).neq("status", "cancelled").gte("scheduled_start", new Date().toISOString()),
    db.from("invoices").select("total, due_date").eq("org_id", orgId).eq("status", "sent").limit(5000),
    db.from("supply_requests").select("urgent").eq("org_id", orgId).neq("status", "done").limit(1000),
    db.from("customer_feedback").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "open"),
  ])
  const openSupply = supplyRes.data ?? []
  const unpaidInvoices = invoicesRes.data ?? []
  const outstanding = unpaidInvoices.reduce((s, i) => s + Number(i.total), 0)
  const overdueCount = unpaidInvoices.filter((i) => i.due_date && i.due_date < today).length

  const reqRows = requests.data ?? []
  const viewRows = views.data ?? []
  const quoteRows = quotes.data ?? []
  const leadRows = leads.data ?? []
  const entryRows = entries.data ?? []
  const inbound = mails.data ?? []
  const openEntries = openEntriesRes.data ?? []
  const staffNames = new Map(staff.map((p) => [p.id, p.name.split(" ")[0]]))
  const inNow = new Set(openEntries.map((e) => `${e.job_id}|${e.employee_id}`))

  // --- 30-day series ---------------------------------------------------------
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  const inWindow = (iso: string, fromDays: number, toDays: number) => {
    const t = new Date(iso).getTime()
    return t >= now - fromDays * DAY && t < now - toDays * DAY
  }
  const perDay = (rows: { created_at: string }[]) => {
    const m = new Map(days.map((d) => [d, 0]))
    for (const r of rows) { const k = dayKey(r.created_at); if (m.has(k)) m.set(k, m.get(k)! + 1) }
    return days.map((d) => m.get(d)!)
  }
  const reqSeries = perDay(reqRows)
  const visitorSeries = (() => {
    const m = new Map(days.map((d) => [d, new Set<string>()]))
    for (const v of viewRows) { const k = dayKey(v.created_at); m.get(k)?.add(v.visitor_hash ?? v.created_at) }
    return days.map((d) => m.get(d)!.size)
  })()
  const req30 = reqRows.filter((r) => inWindow(r.created_at, 30, 0)).length
  const reqPrev = reqRows.filter((r) => inWindow(r.created_at, 60, 30)).length
  const uniq = (rows: typeof viewRows) => new Set(rows.map((r) => `${dayKey(r.created_at)}|${r.visitor_hash}`)).size
  const vis30 = uniq(viewRows.filter((r) => inWindow(r.created_at, 30, 0)))
  const visPrev = uniq(viewRows.filter((r) => inWindow(r.created_at, 60, 30)))

  // --- quotes -----------------------------------------------------------------
  const monthly = (q: (typeof quoteRows)[number]) => (q.billing === "one_time" ? 0 : Number(q.total ?? 0))
  const accepted30 = quoteRows.filter((q) => q.accepted_at && inWindow(q.accepted_at, 30, 0))
  const acceptedPrev = quoteRows.filter((q) => q.accepted_at && inWindow(q.accepted_at, 60, 30))
  const mrrNew = accepted30.reduce((s, q) => s + monthly(q), 0)
  const mrrPrev = acceptedPrev.reduce((s, q) => s + monthly(q), 0)
  const mrrTotal = quoteRows.filter((q) => q.status === "accepted").reduce((s, q) => s + monthly(q), 0)
  const pendingQuotes = quoteRows.filter((q) => q.status === "sent")
  const pendingValue = pendingQuotes.reduce((s, q) => s + Number(q.total ?? 0), 0)
  const decided = quoteRows.filter((q) => q.status === "accepted" || q.status === "declined").length
  const winRate = decided ? Math.round((quoteRows.filter((q) => q.status === "accepted").length / decided) * 100) : 0
  const quoteSegments = [
    { name: "Kladder", value: quoteRows.filter((q) => q.status === "draft").length, color: "#CBD2DA" },
    { name: "Sendt", value: pendingQuotes.length, color: org.color_accent },
    { name: "Accepteret", value: quoteRows.filter((q) => q.status === "accepted").length, color: org.color_primary },
    { name: "Afvist / udløbet", value: quoteRows.filter((q) => q.status === "declined" || q.status === "expired").length, color: "#E0A39C" },
  ]

  // --- hours per week ---------------------------------------------------------
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(eightWeeksAgo, i * 7))
  const hoursPerWeek = weeks.map((w) => {
    const from = new Date(copenhagenToIso(w, "00:00")!).getTime()
    const to = from + 7 * DAY
    return entryRows.reduce((s, e) => {
      const t = new Date(e.check_in_at).getTime()
      if (t < from || t >= to) return s
      return s + ((e.check_out_at ? new Date(e.check_out_at).getTime() : now) - t) / 3600000
    }, 0)
  })
  const hoursThis = hoursPerWeek[7]
  const hoursLast = hoursPerWeek[6]

  // --- pipeline ---------------------------------------------------------------
  const pipeline = leadStages.map(([status, label]) => {
    const rows = leadRows.filter((l) => l.status === status)
    const value = rows.reduce((s, l) => s + Number(l.value ?? 0), 0)
    return { label, value: rows.length, hint: `${rows.length}${value ? ` · ${kr(value).replace(",00 kr.", " kr.")}` : ""}` }
  })
  const openLeads = leadRows.filter((l) => !["won", "lost"].includes(String(l.status))).length

  // --- top pages & sources ----------------------------------------------------
  const recentViews = viewRows.filter((r) => inWindow(r.created_at, 30, 0))
  const count = (key: (r: (typeof viewRows)[number]) => string | null) => {
    const m = new Map<string, number>()
    for (const r of recentViews) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, value]) => ({ label, value }))
  }
  const topPages = count((r) => (r.path.startsWith("/t/") ? "/t/… (tilbud)" : r.path))
  const topSources = count((r) => r.referrer_host ?? "Direkte")

  // --- activity feed ----------------------------------------------------------
  const activity: Activity[] = [
    ...reqRows.slice(0, 8).map((r) => ({ at: r.created_at, icon: "lead" as const, text: `Ny henvendelse fra ${r.name}${r.company ? ` (${r.company})` : ""}`, href: `/admin/mail/${r.id}` })),
    ...quoteRows.filter((q) => q.sent_at).slice(0, 8).map((q) => ({ at: q.sent_at!, icon: "quote" as const, text: `Tilbud #${q.quote_number} sendt til ${q.recipient_company || q.recipient_name || "kunde"}`, href: `/admin/tilbud/${q.id}` })),
    ...quoteRows.filter((q) => q.accepted_at).slice(0, 8).map((q) => ({ at: q.accepted_at!, icon: "accept" as const, text: `Tilbud #${q.quote_number} accepteret af ${q.recipient_company || q.recipient_name || "kunde"}`, href: `/admin/tilbud/${q.id}` })),
    ...inbound.slice(0, 8).map((m) => ({ at: m.created_at, icon: "mail" as const, text: `Svar fra ${m.from_email}: ${m.subject ?? ""}`, href: m.contact_request_id ? `/admin/mail/${m.contact_request_id}` : "/admin/mail" })),
    ...openEntries.slice(0, 8).map((e) => ({ at: e.check_in_at, icon: "in" as const, text: `${staffNames.get(e.employee_id) ?? "Medarbejder"} tjekkede ind`, href: "/admin/timer" })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10)
  const activityIcon = { lead: MessageSquare, quote: FileSignature, accept: CheckCircle2, mail: Mail, in: LogIn }

  const unread = inbound.filter((m) => !m.read_at).length
  const newRequests = reqRows.filter((r) => r.status === "new").length
  const understaffed = todayShifts.filter((s) => s.status !== "cancelled" && s.employeeIds.length < s.max_staff).length

  const kpis = [
    { label: "Henvendelser · 30 dage", value: req30.toLocaleString("da-DK"), delta: <Delta now={req30} before={reqPrev} />, spark: reqSeries, icon: MessageSquare, href: "/admin/mail" },
    { label: "Besøgende · 30 dage", value: vis30.toLocaleString("da-DK"), delta: <Delta now={vis30} before={visPrev} />, spark: visitorSeries, icon: Eye, href: "/admin/statistik" },
    { label: "Ny månedlig omsætning", value: kr(mrrNew).replace(",00 kr.", " kr."), delta: <Delta now={mrrNew} before={mrrPrev} />, spark: null, icon: TrendingUp, href: "/admin/tilbud?vis=accepted", sub: `${kr(mrrTotal).replace(",00 kr.", " kr.")} pr. md. i alt` },
    { label: "Udestående fakturaer", value: kr(outstanding).replace(",00 kr.", " kr."), delta: overdueCount ? <span className="crm-delta is-down">{overdueCount} forfaldne</span> : <span className="crm-delta is-up">Intet forfaldent</span>, spark: null, icon: Receipt, href: "/admin/fakturaer?vis=sent", sub: `${unpaidInvoices.length} ubetalte` },
    { label: "Mangler og feedback", value: String(openSupply.length + (feedbackRes.count ?? 0)), delta: openSupply.some((r) => r.urgent) ? <span className="crm-delta is-down">{openSupply.filter((r) => r.urgent).length} haster</span> : <span className="crm-delta is-flat">{openSupply.length} mangler</span>, spark: null, icon: PackageOpen, href: "/admin/forsyning", sub: `${feedbackRes.count ?? 0} kundefeedback` },
    { label: `Timer · uge ${weekNumber(weekStart)}`, value: hoursThis.toLocaleString("da-DK", { maximumFractionDigits: 1 }), delta: <Delta now={hoursThis} before={hoursLast} />, spark: hoursPerWeek, icon: Clock, href: "/admin/timer" },
  ]

  const setup = [
    { ok: mailConfigured(), text: "Afsendelse af mail", detail: mailConfigured() ? `Sender som ${org.mail_from_name || org.name}` : "RESEND_API_KEY mangler" },
    { ok: org.mail_domain_verified, text: "Eget maildomæne", detail: org.mail_domain_verified ? `@${org.mail_domain}` : "Aktiveres af superadmin" },
    { ok: inboundConfigured(), text: "Kundesvar i indbakken", detail: inboundConfigured() ? "Modtagelse er sat op" : `Svar går til ${officeEmailFor(org)}` },
    { ok: Boolean(org.logo_url), text: "Logo og farver", detail: org.logo_url ? "Sat op" : "Tilføj under Indstillinger", href: "/admin/indstillinger" },
  ]

  return (
    <main className="admin-shell crm">
      <header className="crm-head">
        <div>
          <p className="crm-kicker">{new Date().toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Copenhagen" })}</p>
          <h1>{greeting()}{fullName ? `, ${fullName.split(" ")[0]}` : ""}</h1>
          <p className="crm-head-sub">
            {newRequests ? <Link href="/admin/mail">{newRequests} nye henvendelser</Link> : "Ingen nye henvendelser"}
            {" · "}{unread ? <Link href="/admin/mail">{unread} ulæste svar</Link> : "ingen ulæste svar"}
            {" · "}{todayShifts.length} vagter i dag{understaffed ? <> · <Link href="/admin/vagtplan" className="is-warn">{understaffed} mangler folk</Link></> : null}
          </p>
        </div>
        <div className="crm-head-actions">
          <Link href="/admin/leads?ny=1" className="crm-btn"><Plus className="size-4" /> Lead</Link>
          <Link href="/admin/vagtplan?ny=1" className="crm-btn"><CalendarDays className="size-4" /> Vagt</Link>
          <Link href="/admin/tilbud" className="crm-btn"><FileSignature className="size-4" /> Tilbud</Link>
          <Link href="/admin/fakturaer" className="crm-btn crm-btn-primary"><Receipt className="size-4" /> Faktura</Link>
        </div>
      </header>

      <section className="crm-kpis" aria-label="Nøgletal">
        {kpis.map(({ label, value, delta, spark, icon: Icon, href, sub }) => (
          <Link href={href} className="crm-kpi" key={label}>
            <div className="crm-kpi-top"><span className="crm-kpi-icon"><Icon className="size-4" /></span><span>{label}</span></div>
            <div className="crm-kpi-row">
              <strong>{value}</strong>
              {spark ? <Sparkline values={spark} color={org.color_primary} /> : null}
            </div>
            <div className="crm-kpi-foot">{delta}<small>{sub ?? "mod forrige periode"}</small></div>
          </Link>
        ))}
      </section>

      <section className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head">
            <div><h2>Henvendelser og besøgende</h2><p>Seneste 30 dage</p></div>
            <ul className="crm-legend"><li><i style={{ background: org.color_primary }} />Besøgende</li><li><i style={{ background: org.color_accent }} />Henvendelser</li></ul>
          </header>
          <AreaChart id="traffic" labels={days.map(shortDay)} series={[{ name: "Besøgende", color: org.color_primary, values: visitorSeries }, { name: "Henvendelser", color: org.color_accent, values: reqSeries }]} />
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Tilbud</h2><p>{winRate}% vundet af afgjorte</p></div><Link href="/admin/tilbud" className="crm-link">Alle <ArrowUpRight className="size-3" /></Link></header>
          <div className="crm-donut-wrap">
            <Donut segments={quoteSegments} label={String(quoteRows.length)} sub="tilbud" />
            <ul className="crm-legend crm-legend-col">{quoteSegments.map((s) => <li key={s.name}><i style={{ background: s.color }} />{s.name}<b>{s.value}</b></li>)}</ul>
          </div>
          <p className="crm-note">{pendingQuotes.length} afventer svar · {kr(pendingValue).replace(",00 kr.", " kr.")} ekskl. moms</p>
        </article>
      </section>

      <section className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Salgspipeline</h2><p>{openLeads} åbne leads</p></div><Link href="/admin/leads" className="crm-link">Pipeline <ArrowUpRight className="size-3" /></Link></header>
          <HBars rows={pipeline} color={org.color_primary} />
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Timer pr. uge</h2><p>Seneste 8 uger</p></div><Link href="/admin/timer" className="crm-link">Timer <ArrowUpRight className="size-3" /></Link></header>
          <BarChart values={hoursPerWeek.map((h) => Math.round(h * 10) / 10)} labels={weeks.map((w) => `U${weekNumber(w)}`)} color={org.color_primary} unit=" t" />
        </article>

      </section>

      <section className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Aktivitet</h2><p>Det sker lige nu</p></div></header>
          {activity.length ? (
            <ol className="crm-feed">
              {activity.map((a, i) => {
                const Icon = activityIcon[a.icon]
                return (
                  <li key={i} className={`is-${a.icon}`}>
                    <span className="crm-feed-icon"><Icon className="size-3.5" /></span>
                    <div>{a.href ? <Link href={a.href}>{a.text}</Link> : a.text}<time dateTime={a.at}>{ago(a.at)}</time></div>
                  </li>
                )
              })}
            </ol>
          ) : <p className="crm-empty">Ingen aktivitet endnu.</p>}
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Hjemmesiden</h2><p>Seneste 30 dage</p></div><Link href="/admin/statistik" className="crm-link">Statistik <ArrowUpRight className="size-3" /></Link></header>
          {topPages.length ? (
            <>
              <p className="crm-sub-title"><BarChart3 className="size-3.5" /> Mest besøgte sider</p>
              <HBars rows={topPages} color={org.color_accent} />
              <p className="crm-sub-title"><Users className="size-3.5" /> Hvor de kommer fra</p>
              <HBars rows={topSources} color={org.color_muted} />
            </>
          ) : <p className="crm-empty">Ingen besøg målt endnu. <Link href="/admin/hjemmesider">Forbind hjemmesiden</Link></p>}
        </article>
      </section>

      <section className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Dagens vagter</h2><p>{todayShifts.length} vagter · {openEntries.length} tjekket ind · {openShiftsRes.count ?? 0} ledige fremover</p></div><Link href="/admin/vagtplan" className="crm-link">Vagtplan <ArrowUpRight className="size-3" /></Link></header>
          {todayShifts.length ? (
            <table className="crm-table">
              <thead><tr><th>Tid</th><th>Sted</th><th>Medarbejdere</th><th>Status</th></tr></thead>
              <tbody>
                {todayShifts.map((s) => (
                  <tr key={s.id}>
                    <td className="crm-mono">{s.scheduled_start ? formatTime(s.scheduled_start) : ""}{s.scheduled_end ? `–${formatTime(s.scheduled_end)}` : ""}</td>
                    <td><Link href={`/admin/vagtplan?vagt=${s.id}`}>{shiftName(s)}</Link></td>
                    <td>
                      <div className="crm-avatars">
                        {s.employeeIds.map((id) => <span key={id} className={inNow.has(`${s.id}|${id}`) ? "is-in" : ""} title={`${staffNames.get(id) ?? "?"}${inNow.has(`${s.id}|${id}`) ? " – tjekket ind" : ""}`}>{(staffNames.get(id) ?? "?").slice(0, 2)}</span>)}
                        {s.employeeIds.length < s.max_staff && <span className="is-missing" title="Mangler folk">+{s.max_staff - s.employeeIds.length}</span>}
                      </div>
                    </td>
                    <td><span className={`crm-pill status-${s.status}`}>{s.status === "completed" ? "Udført" : s.status === "in_progress" ? "I gang" : s.status === "cancelled" ? "Aflyst" : "Planlagt"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="crm-empty">Ingen vagter i dag. <Link href="/admin/vagtplan?ny=1">Opret en vagt</Link></p>}
        </article>
      </section>

      <section className="crm-card crm-setup" aria-label="Opsætning">
        <header className="crm-card-head"><div><h2>Opsætning</h2><p>Det, der skal til for at alt virker</p></div><Inbox className="size-4 crm-muted" /></header>
        <ul>
          {setup.map((s) => (
            <li key={s.text} className={s.ok ? "is-ok" : "is-todo"}>
              {s.ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
              <div><strong>{s.href && !s.ok ? <Link href={s.href}>{s.text}</Link> : s.text}</strong><small>{s.detail}</small></div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
