import Link from "next/link"
import { MessageCircleWarning } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { signedUrls } from "@/lib/backend/reports"
import { setFeedbackStatus } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Kundefeedback" }

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ vis?: string }> }) {
  const { org } = await requireRolePage(["admin"], "/admin/feedback")
  const { vis = "open" } = await searchParams
  const db = createAdminClient()
  let query = db.from("customer_feedback").select("id, message, author_name, status, created_at, report_id, location:locations(name), customer:customers(id, name, company)").eq("org_id", org.id).order("created_at", { ascending: false }).limit(200)
  if (vis !== "alle") query = query.eq("status", vis === "handled" ? "handled" : "open")
  const { data: rows } = await query
  const ids = (rows ?? []).map((r) => r.id)
  const { data: photos } = ids.length ? await db.from("photos").select("id, feedback_id, path, caption").eq("org_id", org.id).in("feedback_id", ids) : { data: [] }
  const urls = await signedUrls((photos ?? []).map((p) => String(p.path)))
  const byFeedback = new Map<string, { id: string; url: string | null; caption: string | null }[]>()
  for (const p of photos ?? []) byFeedback.set(String(p.feedback_id), [...(byFeedback.get(String(p.feedback_id)) ?? []), { id: p.id, url: urls.get(String(p.path)) ?? null, caption: p.caption }])

  return (
    <main className="admin-shell crm">
      <header className="crm-head"><div><p className="crm-kicker">{org.name}</p><h1>Kundefeedback</h1><p className="crm-head-sub">Kommentarer og billeder fra kunderne om ting, der skal forbedres.</p></div></header>
      <nav className="crm-tabs" aria-label="Filter">{[["open", "Ubehandlede"], ["handled", "Behandlede"], ["alle", "Alle"]].map(([v, l]) => <Link key={v} href={`?vis=${v}`} aria-current={vis === v ? "page" : undefined}>{l}</Link>)}</nav>
      <div className="crm-pairs">
        {(rows ?? []).map((f) => {
          const cust = f.customer as unknown as { id: string; name: string; company: string | null } | null
          const pics = byFeedback.get(f.id) ?? []
          return (
            <article key={f.id} className="crm-card">
              <header className="crm-card-head">
                <div><h2>{cust ? <Link href={`/admin/kunder/${cust.id}`}>{cust.company || cust.name}</Link> : f.author_name ?? "Kunde"}</h2><p>{(f.location as unknown as { name: string } | null)?.name ?? ""} · {new Date(f.created_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", dateStyle: "short", timeStyle: "short" })}</p></div>
                <span className={`crm-pill ${f.status === "open" ? "inv-overdue" : "inv-paid"}`}>{f.status === "open" ? "Ubehandlet" : "Behandlet"}</span>
              </header>
              <p className="crm-quote">{f.message}</p>
              {pics.length > 0 && <div className="crm-gallery">{pics.map((p) => p.url && <figure key={p.id}><a href={p.url} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.url} alt={p.caption ?? "Billede fra kunden"} loading="lazy" /></a>{p.caption && <figcaption>{p.caption}</figcaption>}</figure>)}</div>}
              <div className="crm-inline" style={{ marginTop: 12 }}>
                {f.report_id && <Link href={`/admin/rapporter/${f.report_id}`} className="crm-btn">Se rapport</Link>}
                <form action={setFeedbackStatus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="status" value={f.status === "open" ? "handled" : "open"} /><button type="submit" className={`crm-btn${f.status === "open" ? " crm-btn-primary" : ""}`}>{f.status === "open" ? "Markér behandlet" : "Genåbn"}</button></form>
              </div>
            </article>
          )
        })}
      </div>
      {!rows?.length && <p className="crm-empty"><MessageCircleWarning className="size-4 inline" /> Ingen feedback her.</p>}
    </main>
  )
}
