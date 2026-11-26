import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, MapPin } from "lucide-react"
import { requireRolePage } from "@/lib/auth-guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { mapsLink } from "@/lib/geo"
import { productStatusLabels } from "@/lib/backend/reports"
import { addTask, importTasksFromQuote, updateTask } from "./actions"

export const dynamic = "force-dynamic"

export default async function LocationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hentet?: string; fejl?: string }> }) {
  const { id } = await params
  const { org } = await requireRolePage(["admin"], `/admin/steder/${id}`)
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = createAdminClient()
  const { data: loc } = await db.from("locations").select("id, name, address, access_notes, customer:customers(id, name, company)").eq("org_id", org.id).eq("id", id).maybeSingle()
  if (!loc) notFound()
  const [{ data: tasks }, { data: stock }, { data: reports }] = await Promise.all([
    db.from("location_tasks").select("id, label, area, position").eq("org_id", org.id).eq("location_id", id).order("position"),
    db.from("location_products").select("status, updated_at, product:products(name)").eq("org_id", org.id).eq("location_id", id),
    db.from("cleaning_reports").select("id, created_at, status").eq("org_id", org.id).eq("location_id", id).order("created_at", { ascending: false }).limit(8),
  ])
  const cust = loc.customer as unknown as { id: string; name: string; company: string | null } | null

  return (
    <main className="admin-shell crm">
      <Link href="/admin/steder" className="crm-back"><ArrowLeft className="size-4" /> Steder</Link>
      <header className="crm-head">
        <div><p className="crm-kicker">Sted{cust ? <> · <Link href={`/admin/kunder/${cust.id}`}>{cust.company || cust.name}</Link></> : null}</p><h1>{loc.name}</h1><p className="crm-head-sub"><MapPin className="size-3 inline" /> <a href={mapsLink(loc.address)} target="_blank" rel="noreferrer">{loc.address}</a></p></div>
        <form action={importTasksFromQuote}><input type="hidden" name="location_id" value={loc.id} /><button className="crm-btn crm-btn-primary" type="submit"><Download className="size-4" /> Hent opgaver fra tilbud</button></form>
      </header>
      {sp.hentet && <p className="admin-notice is-ok" role="status">{sp.hentet} opgaver hentet fra det accepterede tilbud.</p>}
      {sp.fejl && <p className="admin-notice is-error" role="alert">{sp.fejl}</p>}

      <div className="crm-pairs">
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Tjekliste</h2><p>Det medarbejderne krydser af på hver vagt</p></div></header>
          <ul className="crm-list">
            {(tasks ?? []).map((t) => (
              <li key={t.id}>
                <form action={updateTask} className="crm-inline" style={{ width: "100%" }}>
                  <input type="hidden" name="id" value={t.id} />
                  <input name="label" defaultValue={t.label} aria-label="Opgave" style={{ flex: 1 }} />
                  <input name="area" defaultValue={t.area ?? ""} placeholder="Rum" aria-label="Rum" style={{ width: 110 }} />
                  <input name="position" type="number" defaultValue={t.position} aria-label="Rækkefølge" style={{ width: 64 }} />
                  <button className="crm-btn" type="submit">Gem</button>
                  <button className="crm-btn" type="submit" name="delete" value="1" aria-label="Slet">×</button>
                </form>
              </li>
            ))}
          </ul>
          {!tasks?.length && <p className="crm-empty">Ingen opgaver endnu. Hent dem fra tilbuddet eller skriv dem herunder.</p>}
          <form action={addTask} className="grid gap-2" style={{ marginTop: 12 }}>
            <input type="hidden" name="location_id" value={loc.id} />
            <textarea name="labels" rows={3} placeholder={"Én opgave pr. linje, fx\nStøvsug alle kontorer\nTøm skraldespande"} />
            <div className="crm-inline"><input name="area" placeholder="Rum (valgfri)" /><button className="crm-btn crm-btn-primary" type="submit">Tilføj opgaver</button></div>
          </form>
        </article>
        <article className="crm-card">
          <header className="crm-card-head"><div><h2>Produkter på stedet</h2></div><Link href="/admin/forsyning" className="crm-link">Forsyning</Link></header>
          {stock?.length ? <ul className="crm-list">{stock.map((s, i) => <li key={i}><span>{(s.product as unknown as { name: string } | null)?.name}</span><span className={`crm-pill ${s.status === "ok" ? "inv-paid" : s.status === "low" ? "status-in_progress" : "inv-overdue"}`}>{productStatusLabels[s.status as "ok"]}</span></li>)}</ul> : <p className="crm-empty">Ingen status endnu. Den kommer fra medarbejdernes rapporter.</p>}
          <h3 className="crm-sub-title" style={{ marginTop: 16 }}>Seneste rapporter</h3>
          {reports?.length ? <ul className="crm-list">{reports.map((r) => <li key={r.id}><Link href={`/admin/rapporter/${r.id}`}>{new Date(r.created_at).toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short" })}</Link><small>{r.status === "submitted" ? "Sendt" : "I gang"}</small></li>)}</ul> : <p className="crm-empty">Ingen rapporter endnu.</p>}
        </article>
      </div>
    </main>
  )
}
