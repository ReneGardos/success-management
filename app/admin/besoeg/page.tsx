import Link from "next/link"
import { CalendarClock, CalendarX2, Check, X } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { decideVisit } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kundeønsker" }

const fmt = (iso: string) => new Date(iso).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export default async function VisitRequests() {
  const { org } = await requireRolePage(["admin"], "/admin/besoeg")
  const db = createAdminClient()
  const { data: rows } = await db.from("visit_requests").select("id, kind, wish_date, wish_time, note, status, created_at, decided_at, customer:customers(name, company), job:jobs(id, title, scheduled_start, status, location:locations(name))").eq("org_id", org.id).order("created_at", { ascending: false }).limit(150)
  type Row = NonNullable<typeof rows>[number]
  const pending = (rows ?? []).filter((r) => r.status === "pending")
  const done = (rows ?? []).filter((r) => r.status !== "pending")
  const name = (r: Row) => { const c = r.customer as unknown as { name: string; company: string | null } | null; return c?.company || c?.name || "Kunde" }
  const job = (r: Row) => r.job as unknown as { id: string; title: string | null; scheduled_start: string | null; status: string; location: { name: string } | null } | null
  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Kundeønsker</h1><p className="crm-head-sub">Kunder, der vil flytte eller springe et besøg over. Godkend, så opdateres vagtplanen, og kunde og medarbejder får besked.</p></div></header>
      <section className="crm-kpis">
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Venter</span></div><div className="crm-kpi-row"><strong className={pending.length ? "is-warn" : ""}>{pending.length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Flyt</span></div><div className="crm-kpi-row"><strong>{pending.filter((r) => r.kind === "move").length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Spring over</span></div><div className="crm-kpi-row"><strong>{pending.filter((r) => r.kind === "skip").length}</strong></div></div>
        <div className="crm-kpi"><div className="crm-kpi-top"><span>Behandlet</span></div><div className="crm-kpi-row"><strong>{done.length}</strong></div></div>
      </section>
      <div className="crm-pairs">
        {pending.map((r) => { const j = job(r); return (
          <article key={r.id} className="crm-card vr-card">
            <header className="crm-card-head"><div><h2>{r.kind === "skip" ? <><CalendarX2 className="size-4 inline" /> Spring over</> : <><CalendarClock className="size-4 inline" /> Flyt besøg</>}</h2><p>{name(r)} · {j?.location?.name ?? j?.title}</p></div><span className="crm-pill status-in_progress">Venter</span></header>
            <dl className="vr-dl">
              <div><dt>Nu</dt><dd>{j?.scheduled_start ? fmt(j.scheduled_start) : "–"} {j && <Link href={`/admin/vagtplan?vagt=${j.id}`} className="crm-muted">(vagtplan)</Link>}</dd></div>
              {r.kind === "move" && <div><dt>Ønsker</dt><dd>{r.wish_date ? new Date(`${r.wish_date}T12:00:00Z`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" }) : "–"}{r.wish_time ? ` kl. ${r.wish_time}` : ""}</dd></div>}
              {r.note && <div><dt>Besked</dt><dd>{r.note}</dd></div>}
            </dl>
            <form action={decideVisit} className="vr-actions">
              <input type="hidden" name="id" value={r.id} />
              {r.kind === "move" && <><input type="date" name="date" defaultValue={r.wish_date ?? ""} aria-label="Ny dato" /><input type="time" name="time" defaultValue={r.wish_time ?? ""} aria-label="Nyt tidspunkt" /></>}
              <button className="crm-btn crm-btn-primary" name="decision" value="approved"><Check className="size-4" /> Godkend</button>
              <button className="crm-btn" name="decision" value="declined"><X className="size-4" /> Afvis</button>
            </form>
          </article>
        ) })}
        {!pending.length && <article className="crm-card"><p className="crm-empty">Ingen ønsker venter. 🎉</p></article>}
      </div>
      {done.length > 0 && (
        <article className="crm-card crm-card-flush">
          <header className="crm-card-head crm-pad"><div><h2>Behandlet</h2></div></header>
          <table className="crm-table"><thead><tr><th>Kunde</th><th>Ønske</th><th>Besøg</th><th>Status</th></tr></thead><tbody>
            {done.slice(0, 50).map((r) => { const j = job(r); return <tr key={r.id}><td>{name(r)}</td><td>{r.kind === "skip" ? "Spring over" : `Flyt til ${r.wish_date ?? "?"}`}</td><td>{j?.scheduled_start ? fmt(j.scheduled_start) : "–"}</td><td><span className={`crm-pill abs-${r.status}`}>{r.status === "approved" ? "Godkendt" : "Afvist"}</span></td></tr> })}
          </tbody></table>
        </article>
      )}
    </main>
  )
}
