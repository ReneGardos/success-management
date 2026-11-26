import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { employeePortal } from "@/lib/portal"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadProducts } from "@/lib/backend/reports"
import { requestSupply } from "../rapport/actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Mangler noget?", robots: { index: false, follow: false } }

export default async function MissingPage({ searchParams }: { searchParams: Promise<{ fejl?: string; sted?: string }> }) {
  const { org, userId, preview } = await employeePortal("/medarbejder/mangler")
  const sp = await searchParams
  const db = createAdminClient()
  const [products, { data: locations }, { data: mine }] = await Promise.all([
    loadProducts(org.id),
    db.from("locations").select("id, name").eq("org_id", org.id).eq("active", true).order("name"),
    db.from("supply_requests").select("id, message, status, created_at, product:products(name), location:locations(name)").eq("org_id", org.id).eq("employee_id", userId).order("created_at", { ascending: false }).limit(10),
  ])
  return (
    <main className="field">
      <Link href="/medarbejder" className="field-back"><ArrowLeft className="size-5" /> I dag</Link>
      <header className="field-head"><p>{org.name}</p><h1>Mangler noget?</h1><span>Kontoret får besked med det samme.</span></header>
      {sp.fejl && <p className="field-err" role="alert">{sp.fejl}</p>}
      <form action={requestSupply} className="field-card field-form" inert={preview ? true : undefined}>
        <label className="field-label">Sted<select name="location_id" defaultValue={sp.sted ?? ""}><option value="">Ikke et bestemt sted</option>{(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="field-label">Produkt<select name="product_id" defaultValue=""><option value="">Andet (skriv herunder)</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="field-label">Besked<textarea name="message" rows={3} placeholder="Fx: Vi mangler nøgle til kælderen / støvsugerposer" /></label>
        <label className="field-task"><input type="checkbox" name="urgent" /><span className="field-tick" aria-hidden="true" /><span>Haster</span></label>
        <button type="submit" className="field-btn field-btn-primary">Send besked</button>
      </form>
      {(mine?.length ?? 0) > 0 && (
        <section className="field-card">
          <h2>Mine beskeder</h2>
          <ul className="field-list">{mine!.map((m) => <li key={m.id}><span>{(m.product as unknown as { name: string } | null)?.name ?? m.message}{(m.location as unknown as { name: string } | null) ? ` · ${(m.location as unknown as { name: string }).name}` : ""}</span><b className={`is-${m.status}`}>{m.status === "open" ? "Sendt" : m.status === "ordered" ? "Bestilt" : "Klaret"}</b></li>)}</ul>
        </section>
      )}
    </main>
  )
}
