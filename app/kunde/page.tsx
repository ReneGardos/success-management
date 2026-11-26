import Link from "next/link"
import { Check, FileText, Receipt } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { kr, statusLabels } from "@/lib/backend/quotes"
import { displayStatus, invoiceNo, invoiceStatusLabels } from "@/lib/backend/invoices"
import PhotoUpload from "@/components/photo-upload"
import { customerUploadTarget, registerCustomerPhoto, submitCustomerFeedback } from "./actions"
import { customerIdsFor } from "@/lib/backend/customers"

export const metadata = { title: "Kundeportal", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function CustomerPage({ searchParams }: { searchParams: Promise<{ tak?: string; fejl?: string }> }) {
  const { user, org, ctx } = await requireRolePage(["customer", "admin"], "/kunde")
  const sp = await searchParams
  const db = createAdminClient()
  const customerIds = await customerIdsFor(org.id, user.id, user.email)
  const ids = customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]
  const [{ data: locations }, { data: quotes }, { data: invoices }] = await Promise.all([
    db.from("locations").select("id, name, address").eq("org_id", org.id).in("customer_id", ids).order("name"),
    db.from("quotes").select("id, quote_number, title, status, total, billing, public_token").eq("org_id", org.id).neq("status", "draft").in("customer_id", ids).order("created_at", { ascending: false }).limit(20),
    db.from("invoices").select("id, invoice_number, credit_of, status, total, due_date, issue_date, public_token").eq("org_id", org.id).neq("status", "draft").in("customer_id", ids).order("issue_date", { ascending: false }).limit(20),
  ])
  const locIds = (locations ?? []).map((l) => l.id)
  const { data: reports } = locIds.length
    ? await db.from("cleaning_reports").select("id, public_token, created_at, location_id, job:jobs(scheduled_start)").eq("org_id", org.id).in("location_id", locIds).eq("status", "submitted").eq("customer_visible", true).order("created_at", { ascending: false }).limit(30)
    : { data: [] }
  const rIds = (reports ?? []).map((r) => r.id)
  const { data: items } = rIds.length ? await db.from("cleaning_report_items").select("report_id, done").eq("org_id", org.id).in("report_id", rIds) : { data: [] }
  const score = new Map<string, [number, number]>()
  for (const i of items ?? []) { const s = score.get(i.report_id) ?? [0, 0]; s[1]++; if (i.done) s[0]++; score.set(i.report_id, s) }
  const locName = new Map((locations ?? []).map((l) => [l.id, l.name]))

  return (
    <main className="portal" style={{ ["--primary" as string]: org.color_primary, ["--accent" as string]: org.color_accent, background: org.color_background }}>
      <div className="portal-wrap">
        <header className="portal-head">
          <div><p>{org.name} · Kundeportal</p><h1>Rengøring, tilbud og fakturaer</h1></div>
          <div className="portal-head-actions">
            {ctx.memberships.length > 1 && <Link href="/vaelg-virksomhed?skift=1">Skift virksomhed</Link>}
            <form action="/auth/sign-out" method="post"><button type="submit">Log ud</button></form>
          </div>
        </header>

        {!customerIds.length && <p className="field-err">Din bruger er ikke koblet til en kunde endnu. Kontakt {org.name}.</p>}

        <section className="portal-card">
          <h2>Rengøringsrapporter</h2>
          {reports?.length ? (
            <ul className="portal-list">
              {reports.map((r) => {
                const [d, t] = score.get(r.id) ?? [0, 0]
                const when = (r.job as unknown as { scheduled_start: string | null } | null)?.scheduled_start ?? r.created_at
                return (
                  <li key={r.id}>
                    <a href={`/r/${r.public_token}`}>
                      <span><strong>{new Date(when).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })}</strong><small>{locName.get(String(r.location_id)) ?? ""}</small></span>
                      <span className={`portal-score${d === t ? " is-full" : ""}`}><Check className="size-4" /> {d}/{t}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          ) : <p className="portal-empty">Ingen rapporter endnu.</p>}
        </section>

        <div className="portal-pair">
          <section className="portal-card">
            <h2><FileText className="size-4 inline" /> Tilbud</h2>
            {quotes?.length ? <ul className="portal-list">{quotes.map((q) => <li key={q.id}><a href={`/t/${q.public_token}`}><span><strong>#{q.quote_number}</strong><small>{q.title}</small></span><span>{statusLabels[q.status] ?? q.status}{q.total ? ` · ${kr(Number(q.total))}${q.billing === "one_time" ? "" : "/md."}` : ""}</span></a></li>)}</ul> : <p className="portal-empty">Ingen tilbud.</p>}
          </section>
          <section className="portal-card">
            <h2><Receipt className="size-4 inline" /> Fakturaer</h2>
            {invoices?.length ? <ul className="portal-list">{invoices.map((i) => { const st = displayStatus(i as never); return <li key={i.id}><a href={`/f/${i.public_token}`}><span><strong>{invoiceNo(org, i)}</strong><small>{new Date(`${i.issue_date}T12:00:00Z`).toLocaleDateString("da-DK")}</small></span><span>{invoiceStatusLabels[st]} · {kr(Number(i.total))}</span></a></li> })}</ul> : <p className="portal-empty">Ingen fakturaer.</p>}
          </section>
        </div>

        <section className="portal-card" id="feedback">
          <h2>Er der noget, vi skal forbedre?</h2>
          {sp.fejl && <p className="field-err" role="alert">Skriv en kort besked.</p>}
          {sp.tak ? (
            <>
              <p className="field-ok" role="status">Tak! Vi har fået din besked. Tilføj gerne et billede.</p>
              {/^[0-9a-f-]{36}$/i.test(sp.tak) && <PhotoUpload requestTarget={customerUploadTarget.bind(null, sp.tak)} register={registerCustomerPhoto.bind(null, sp.tak)} label="Tilføj billede" />}
              <p><Link href="/kunde#feedback">Skriv en ny besked</Link></p>
            </>
          ) : (
            <form action={submitCustomerFeedback} className="rv-form">
              {(locations?.length ?? 0) > 1 && <select name="location_id" defaultValue=""><option value="">Vælg sted</option>{locations!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
              {locations?.length === 1 && <input type="hidden" name="location_id" value={locations[0].id} />}
              <textarea name="message" rows={4} required placeholder="Beskriv hvad der skal forbedres" />
              <button type="submit" className="field-btn field-btn-primary">Send</button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
