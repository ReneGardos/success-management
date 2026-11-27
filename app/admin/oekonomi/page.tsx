import Link from "next/link"
import { AlertTriangle, TrendingUp } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { AreaChart, Donut, HBars } from "@/components/charts"
import { kr, splitTotals, type QuoteLine } from "@/lib/backend/quotes"
import { loadEmployeePay, loadEntries, loadPayrollSettings, splitEntry, type Entry } from "@/lib/backend/payroll"
import { copenhagenToIso, todayLocal } from "@/lib/time"

export const dynamic = "force-dynamic"
export const metadata = { title: "Økonomi" }

const monthKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" }).slice(0, 7)
const addMonths = (ym: string, n: number) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7) }
const k = (n: number) => kr(n).replace(/,\d\d kr\.$/, " kr.")
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/oekonomi")
  const sp = await searchParams
  const span = ["3", "6", "12"].includes(sp.periode ?? "") ? Number(sp.periode) : 3
  const db = createAdminClient()
  const today = todayLocal()
  const thisMonth = today.slice(0, 7)
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11))
  const fromIso = copenhagenToIso(`${months[0]}-01`, "00:00")!
  const periodStart = addMonths(thisMonth, -(span - 1))

  const [{ data: invoices }, entries, s, pay, { data: jobs }, { data: customers }, { data: agreements }] = await Promise.all([
    db.from("invoices").select("id, customer_id, subtotal, total, status, issue_date, due_date, paid_at").eq("org_id", org.id).neq("status", "draft").neq("status", "void").gte("issue_date", `${months[0]}-01`).limit(5000),
    loadEntries(org.id, fromIso, new Date().toISOString()),
    loadPayrollSettings(org.id),
    loadEmployeePay(org.id),
    db.from("jobs").select("id, customer_id, location:locations(customer_id)").eq("org_id", org.id).gte("scheduled_start", fromIso).limit(10000),
    db.from("customers").select("id, name, company").eq("org_id", org.id).limit(2000),
    db.from("quotes").select("id, customer_id, billing, vat_rate").eq("org_id", org.id).eq("status", "accepted").neq("billing", "one_time"),
  ])
  const { data: openInv } = await db.from("invoices").select("total, due_date").eq("org_id", org.id).eq("status", "sent")
  const aIds = (agreements ?? []).map((a) => a.id)
  const { data: aLines } = aIds.length ? await db.from("quote_line_items").select("quote_id, description, quantity, unit, unit_price, position, recurring").eq("org_id", org.id).in("quote_id", aIds) : { data: [] }
  const mrr = (agreements ?? []).reduce((t, a) => t + splitTotals(((aLines ?? []).filter((l) => l.quote_id === a.id).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) }))) as QuoteLine[], Number(a.vat_rate ?? 25), a.billing).monthly.subtotal, 0)

  // Labour cost per entry: hours × wage + supplements, plus overhead and mileage.
  const costOf = (e: Entry) => {
    const x = splitEntry(e, s)
    const wage = pay.get(e.employee_id)?.hourly_wage ?? s.default_wage
    return { hours: x.hours, cost: (x.hours * wage + x.evening * s.evening_supplement + x.weekend * s.weekend_supplement) * (1 + s.labor_overhead_pct / 100) + Number(e.km || 0) * s.km_rate }
  }
  const jobCustomer = new Map((jobs ?? []).map((j) => [j.id, (j.customer_id ?? (j.location as unknown as { customer_id: string | null } | null)?.customer_id ?? null) as string | null]))
  const rev = new Map<string, number>(), cost = new Map<string, number>(), hours = new Map<string, number>()
  const cRev = new Map<string, number>(), cCost = new Map<string, number>(), cHours = new Map<string, number>()
  for (const i of invoices ?? []) {
    const m = String(i.issue_date).slice(0, 7)
    rev.set(m, (rev.get(m) ?? 0) + Number(i.subtotal))
    if (m >= periodStart && i.customer_id) cRev.set(i.customer_id, (cRev.get(i.customer_id) ?? 0) + Number(i.subtotal))
  }
  for (const e of entries) {
    if (!e.check_out_at) continue
    const m = monthKey(e.check_in_at)
    const c = costOf(e)
    cost.set(m, (cost.get(m) ?? 0) + c.cost)
    hours.set(m, (hours.get(m) ?? 0) + c.hours)
    const cust = e.job_id ? jobCustomer.get(e.job_id) : null
    if (m >= periodStart && cust) { cCost.set(cust, (cCost.get(cust) ?? 0) + c.cost); cHours.set(cust, (cHours.get(cust) ?? 0) + c.hours) }
  }
  const inPeriod = months.filter((m) => m >= periodStart)
  const sumM = (map: Map<string, number>) => inPeriod.reduce((t, m) => t + (map.get(m) ?? 0), 0)
  const R = sumM(rev), C = sumM(cost), H = sumM(hours)
  const prevMonths = Array.from({ length: span }, (_, i) => addMonths(periodStart, -(i + 1)))
  const Rprev = prevMonths.reduce((t, m) => t + (rev.get(m) ?? 0), 0)
  const names = new Map((customers ?? []).map((c) => [c.id, c.company || c.name]))
  const custRows = [...new Set([...cRev.keys(), ...cCost.keys()])].map((id) => {
    const r = cRev.get(id) ?? 0, c = cCost.get(id) ?? 0, h = cHours.get(id) ?? 0
    return { id, name: names.get(id) ?? "Ukendt kunde", r, c, h, db: r - c, dbp: pct(r - c, r), perHour: h ? r / h : 0 }
  }).sort((a, b) => b.r - a.r)
  const aging = { a: 0, b: 0, c: 0, d: 0 }
  for (const i of openInv ?? []) {
    const days = i.due_date ? Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${i.due_date}T12:00:00Z`)) / 86400000) : 0
    const t = Number(i.total)
    if (days <= 0) aging.a += t; else if (days <= 30) aging.b += t; else if (days <= 60) aging.c += t; else aging.d += t
  }
  const labels = months.map((m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("da-DK", { month: "short", timeZone: "UTC" }).replace(".", ""))
  const growth = Rprev ? Math.round(((R - Rprev) / Rprev) * 100) : null
  const lowMargin = custRows.filter((c) => c.r > 0 && c.dbp < 20)
  const q = (p: number) => `/admin/oekonomi?periode=${p}`

  return (
    <main className="admin-shell crm">
      <header className="crm-head">
        <div><p className="crm-kicker">{org.name}</p><h1>Økonomi</h1><p className="crm-head-sub">Omsætning, lønomkostninger og dækningsbidrag – pr. måned og pr. kunde. Beløb ekskl. moms.</p></div>
        <nav className="cal-switch" aria-label="Periode">{[3, 6, 12].map((p) => <Link key={p} href={q(p)} aria-current={span === p ? "page" : undefined}>{p} mdr.</Link>)}</nav>
      </header>
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Omsætning</span></div><div className="crm-kpi-row"><strong>{k(R)}</strong>{growth !== null && <span className={`crm-delta ${growth >= 0 ? "is-up" : "is-down"}`}>{growth >= 0 ? "▲" : "▼"} {Math.abs(growth)} %</span>}</div><div className="crm-kpi-foot"><small>seneste {span} mdr.</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Lønomkostning</span></div><div className="crm-kpi-row"><strong>{k(C)}</strong></div><div className="crm-kpi-foot"><small>{Math.round(H)} timer</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Dækningsbidrag</span></div><div className="crm-kpi-row"><strong className={R - C < 0 ? "is-warn" : ""}>{k(R - C)}</strong></div><div className="crm-kpi-foot"><small>{pct(R - C, R)} % af omsætningen</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Omsætning pr. time</span></div><div className="crm-kpi-row"><strong>{H ? k(R / H) : "–"}</strong></div><div className="crm-kpi-foot"><small>lønomkostning {H ? k(C / H) : "–"}/t</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Faste aftaler (MRR)</span></div><div className="crm-kpi-row"><strong>{k(mrr)}</strong></div><div className="crm-kpi-foot"><small>≈ {k(mrr * 12)} om året</small></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Udestående</span></div><div className="crm-kpi-row"><strong className={aging.c + aging.d > 0 ? "is-warn" : ""}>{k(aging.a + aging.b + aging.c + aging.d)}</strong></div><div className="crm-kpi-foot"><small>{k(aging.b + aging.c + aging.d)} forfaldent</small></div></div>
      </section>
      <div className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head"><div><h2><TrendingUp className="size-4 inline" /> Omsætning og løn, 12 mdr.</h2><p>Faktureret ekskl. moms mod lønomkostning.</p></div></header>
          <AreaChart id="fin" labels={labels} series={[{ name: "Omsætning", color: org.color_primary, values: months.map((m) => Math.round(rev.get(m) ?? 0)) }, { name: "Løn", color: org.color_accent, values: months.map((m) => Math.round(cost.get(m) ?? 0)) }]} />
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Udestående fordelt på alder</h2><p>Sendte, ubetalte fakturaer inkl. moms.</p></div></header>
          <div className="fin-aging">
            <Donut label={k(aging.a + aging.b + aging.c + aging.d)} sub="i alt" segments={[{ name: "Ikke forfaldent", value: aging.a, color: "#12B76A" }, { name: "1–30 dage", value: aging.b, color: "#F79009" }, { name: "31–60 dage", value: aging.c, color: "#F04438" }, { name: "Over 60 dage", value: aging.d, color: "#912018" }]} />
            <ul>{[["Ikke forfaldent", aging.a, "#12B76A"], ["1–30 dage", aging.b, "#F79009"], ["31–60 dage", aging.c, "#F04438"], ["Over 60 dage", aging.d, "#912018"]].map(([l, v, c]) => <li key={String(l)}><i style={{ background: String(c) }} />{l}<b>{k(Number(v))}</b></li>)}</ul>
          </div>
          <Link href="/admin/automatisering" className="crm-muted">Automatiske rykkere →</Link>
        </article>
      </div>
      {lowMargin.length > 0 && <p className="admin-notice is-error"><AlertTriangle className="size-4 inline" /> {lowMargin.length} kunde{lowMargin.length === 1 ? "" : "r"} har under 20 % i dækningsbidrag: {lowMargin.slice(0, 4).map((c) => c.name).join(", ")}. Overvej prisen eller tidsforbruget.</p>}
      <div className="crm-pairs">
        <article className="crm-card crm-card-flush">
          <header className="crm-card-head crm-pad"><div><h2>Pr. kunde · seneste {span} mdr.</h2><p>Timer tælles fra check-in på kundens steder.</p></div></header>
          <div className="crm-scroll"><table className="crm-table">
            <thead><tr><th>Kunde</th><th className="crm-right">Omsætning</th><th className="crm-right">Timer</th><th className="crm-right">Løn</th><th className="crm-right">DB</th><th className="crm-right">kr./t</th></tr></thead>
            <tbody>
              {custRows.map((c) => <tr key={c.id}><td><Link href={`/admin/kunder/${c.id}`}>{c.name}</Link></td><td className="crm-right">{k(c.r)}</td><td className="crm-right">{Math.round(c.h * 10) / 10}</td><td className="crm-right">{k(c.c)}</td><td className="crm-right"><span className={`fin-db ${c.r === 0 ? "" : c.dbp < 20 ? "is-low" : c.dbp < 40 ? "is-mid" : "is-good"}`}>{c.r ? `${c.dbp} %` : "–"}</span></td><td className="crm-right">{c.perHour ? k(c.perHour) : "–"}</td></tr>)}
              {!custRows.length && <tr><td colSpan={6} className="crm-empty">Ingen fakturaer eller timer i perioden.</td></tr>}
            </tbody>
          </table></div>
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Største kunder</h2><p>Andel af omsætningen</p></div></header>
          <HBars color={org.color_primary} rows={custRows.slice(0, 8).map((c) => ({ label: c.name, value: Math.round(c.r), hint: `${pct(c.r, R)} %` }))} />
          <p className="crm-muted" style={{ marginTop: 12 }}>Prognose: med de faste aftaler forventes mindst <strong>{k(mrr * 3)}</strong> de næste 3 måneder.</p>
        </article>
      </div>
    </main>
  )
}
